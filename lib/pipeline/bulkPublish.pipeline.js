import fs from "fs";
import os from "os";
import path from "path";
import { DateTime } from "luxon";

import { getAccounts } from "@/lib/accounts/getAccounts";
import { normalizeBoolean } from "@/lib/campaignNormalization";
import { findCampaignBySlug } from "@/lib/campaigns";
import { publishVideo } from "@/lib/pipeline/publishVideo";
import {
  clearBulkPublishRun,
  isBulkPublishAbortError,
  registerBulkPublishRun,
  throwIfBulkPublishAborted,
} from "@/lib/pipeline/bulkPublishRunRegistry";
import {
  buildPostDuplicateKey,
  findDuplicatePost,
  isBlockingDuplicatePost,
} from "@/lib/post/duplicateGuard";
import { persistFailedPostRecord } from "@/lib/post";
import {
  getLatestCampaignPublishAt,
  listFailedPosts,
  listFailedPostsByDuplicateKeys,
} from "@/lib/post/queries/listPosts";
import { buildStoredPostTarget } from "@/lib/post/targets";
import {
  loadProgress,
  resetProgress,
  saveProgress,
} from "@/lib/utils/progressManager";
import {
  easternDateTimeInputToIso,
  EASTERN_TIMEZONE,
  getDefaultBulkPublishDateTimeInput,
} from "@/lib/utils/easternTime";

const BULK_PUBLISH_RETRY_BASE_DELAY_MS = 5 * 1000;
const BULK_PUBLISH_RETRY_MAX_DELAY_MS = 60 * 1000;
const BULK_PUBLISH_RETRY_WAIT_STEP_MS = 1000;
const BULK_PUBLISH_MAX_RETRY_ATTEMPTS = Math.max(
  1,
  Number(process.env.BULK_PUBLISH_MAX_RETRY_ATTEMPTS || 5) || 5
);
const CPU_COUNT = Math.max(1, os.cpus()?.length || 1);
const DEFAULT_STANDARD_WORKER_COUNT = Math.max(
  1,
  Math.min(8, CPU_COUNT)
);
const BULK_PUBLISH_STANDARD_CONCURRENCY = Math.max(
  1,
  Number(
    process.env.BULK_PUBLISH_STANDARD_CONCURRENCY ||
      DEFAULT_STANDARD_WORKER_COUNT
  ) || DEFAULT_STANDARD_WORKER_COUNT
);
const BULK_PUBLISH_PROGRESS_FLUSH_INTERVAL_MS = Math.max(
  250,
  Number(process.env.BULK_PUBLISH_PROGRESS_FLUSH_INTERVAL_MS || 1000) || 1000
);
const BULK_PUBLISH_PROGRESS_FLUSH_BATCH_SIZE = Math.max(
  1,
  Number(process.env.BULK_PUBLISH_PROGRESS_FLUSH_BATCH_SIZE || 20) || 20
);
const BULK_PUBLISH_CONTROL_POLL_INTERVAL_MS = Math.max(
  250,
  Number(process.env.BULK_PUBLISH_CONTROL_POLL_INTERVAL_MS || 1000) || 1000
);
const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".avi",
  ".mkv",
  ".webm",
]);

function normalizeBulkPublishMode() {
  return "same-time";
}

function loadBulkPublishSourceFiles(dir) {
  const resolvedDir = path.resolve(String(dir || ""));

  if (!resolvedDir || !fs.existsSync(resolvedDir)) {
    throw new Error("Folder path not found");
  }

  const stat = fs.statSync(resolvedDir);

  if (!stat.isDirectory()) {
    throw new Error("Folder path must be a directory");
  }

  return fs
    .readdirSync(resolvedDir)
    .map((file) => {
      const fullPath = path.join(resolvedDir, file);
      const fileStat = fs.statSync(fullPath);

      if (!fileStat.isFile()) {
        return null;
      }

      const extension = path.extname(file).toLowerCase();

      if (!VIDEO_EXTENSIONS.has(extension)) {
        return null;
      }

      return {
        name: file,
        path: fullPath,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    );
}

function resolveBulkPublishWorkerCount() {
  return BULK_PUBLISH_STANDARD_CONCURRENCY;
}

function isCancellationRequested(progress) {
  if (!progress) {
    return false;
  }

  return (
    progress.cancelRequested === true ||
    progress.status === "cancelling" ||
    progress.status === "cancelled"
  );
}

async function saveCancelledProgress(progress, overrides = {}) {
  await saveProgress({
    ...(progress || {}),
    ...overrides,
    completed: false,
    status: "cancelled",
    cancelRequested: false,
    error: null,
    finishedAt: new Date().toISOString(),
  });
}

function normalizeJobTarget(target = {}) {
  const accountId = String(
    target?.account_id || target?.accountId || target?.id || ""
  ).trim();

  if (!accountId) {
    return null;
  }

  return {
    id: accountId,
    account_id: accountId,
    username: String(target?.username || "").trim(),
    avatar_url: String(target?.avatar_url || target?.avatarUrl || "").trim(),
    platform: String(target?.platform || "").trim(),
    status: String(target?.status || "").trim(),
  };
}

function buildJobTargets(targets = []) {
  if (!Array.isArray(targets)) {
    return [];
  }

  return targets.map(normalizeJobTarget).filter(Boolean);
}

function buildStoredTargetsFromJob(job) {
  return buildJobTargets(job?.targets).map(buildStoredPostTarget);
}

function buildTargetSignature(targets = []) {
  return buildJobTargets(targets)
    .map((target) => target.id)
    .filter(Boolean)
    .sort()
    .join(",");
}

function formatTargetLabel(targets = []) {
  const normalizedTargets = buildJobTargets(targets);

  if (!normalizedTargets.length) {
    return "";
  }

  if (normalizedTargets.length === 1) {
    return String(
      normalizedTargets[0]?.username || normalizedTargets[0]?.id || ""
    ).trim();
  }

  return `${normalizedTargets.length} accounts`;
}

function buildFolderOrderJobs(videos, accounts, captions = []) {
  const matchedJobs = [];
  const skippedVideos = [];
  const invalidAccounts = [];
  const usableTargets = [];

  for (const account of accounts) {
    const normalizedTarget = normalizeJobTarget(account);

    if (!normalizedTarget) {
      invalidAccounts.push(
        String(account?.username || "unknown").trim() || "unknown"
      );
      continue;
    }

    usableTargets.push(normalizedTarget);
  }

  if (invalidAccounts.length) {
    const samples = invalidAccounts.slice(0, 5).join(", ");
    const overflow = invalidAccounts.length > 5
      ? ` and ${invalidAccounts.length - 5} more`
      : "";

    throw new Error(
      `Assigned campaign accounts are missing PostOnce account IDs: ${samples}${overflow}`
    );
  }

  if (videos.length !== usableTargets.length) {
    throw new Error(
      `Bulk publish requires exactly ${usableTargets.length} video${
        usableTargets.length === 1 ? "" : "s"
      } for ${usableTargets.length} assigned account${
        usableTargets.length === 1 ? "" : "s"
      }, but found ${videos.length} video${videos.length === 1 ? "" : "s"}`
    );
  }

  for (let index = 0; index < videos.length; index += 1) {
    matchedJobs.push({
      video: videos[index],
      caption: String(captions[index] || "").trim() || null,
      targets: [usableTargets[index]],
      matchType: "folder-order",
    });
  }

  return {
    matchedJobs,
    skippedVideos,
    missingAccounts: [],
  };
}

function parseBulkPublishTitleInput(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return [];
  }

  return normalizedValue.split("|").map((item) => String(item || "").trim());
}

function resolveBulkPublishCaptions(
  captionInput,
  expectedCount = 0,
  options = {}
) {
  const captions = parseBulkPublishTitleInput(captionInput);
  const emptyCaptionIndex = captions.findIndex((item) => !item);
  const allowSingle = options.allowSingle !== false;

  if (!captions.length) {
    throw new Error("Caption list is required");
  }

  if (emptyCaptionIndex >= 0) {
    throw new Error(
      `Bulk publish caption ${emptyCaptionIndex + 1} cannot be empty`
    );
  }

  if (!expectedCount) {
    return captions;
  }

  if (allowSingle && captions.length === 1) {
    return Array.from({ length: expectedCount }, () => captions[0]);
  }

  if (captions.length !== expectedCount) {
    throw new Error(
      `Bulk publish requires ${
        allowSingle ? `either 1 caption for all items or ${expectedCount} captions` : `${expectedCount} captions`
      }, but ${captions.length} ${
        captions.length === 1 ? "was" : "were"
      } provided`
    );
  }

  return captions;
}

function buildJobsForPublishMode(
  videos,
  accounts,
  captions = []
) {
  return buildFolderOrderJobs(videos, accounts, captions);
}

function buildRetryJobs(failedJobs) {
  if (!Array.isArray(failedJobs)) {
    return [];
  }

  return failedJobs
    .map((entry) => {
      const videoName = String(entry?.videoName || "").trim();
      const videoPath = String(entry?.videoPath || "").trim();
      const targets = buildJobTargets(
        Array.isArray(entry?.targets)
          ? entry.targets
          : entry?.accountId
            ? [{
                account_id: entry.accountId,
                username: entry.username,
                platform: entry.platform,
                status: entry.status,
              }]
            : []
      );

      if ((!videoName && !videoPath) || !targets.length) {
        return null;
      }

      return {
        video: {
          name: videoName || path.basename(videoPath),
          path: videoPath,
        },
        caption: String(entry?.caption || "").trim() || null,
        targets,
        matchType: String(entry?.matchType || "retry").trim() || "retry",
        publishAt: String(entry?.publishAt || "").trim() || null,
        duplicateKey: String(entry?.duplicateKey || "").trim() || null,
        retryAttemptCount: Math.max(
          0,
          Number(entry?.retryAttemptCount || 0) || 0
        ),
        nextRetryAt: String(entry?.nextRetryAt || "").trim() || null,
        urlWatcherEnabled: normalizeBoolean(entry?.urlWatcherEnabled, false),
      };
    })
    .filter(Boolean);
}

export function buildRetryJobFromFailedPost(post) {
  const videoPath =
    String(post?.source_file_path || post?.failure?.videoPath || "").trim() || null;
  const targets = buildJobTargets(post?.targets);

  if (!videoPath || !targets.length) {
    return null;
  }

  const primaryTarget = targets[0] || null;

  return {
    videoName:
      String(post?.failure?.videoName || "").trim() || path.basename(videoPath),
    videoPath,
    caption: String(post?.content || "").trim() || null,
    accountId: targets.length === 1 ? primaryTarget?.id || null : null,
    username: targets.length === 1 ? primaryTarget?.username || null : null,
    avatar_url: targets.length === 1 ? primaryTarget?.avatar_url || null : null,
    platform: targets.length === 1 ? primaryTarget?.platform || null : null,
    status: targets.length === 1 ? primaryTarget?.status || null : null,
    targets,
    matchType:
      String(
        post?.failure?.matchType ||
          (targets.length > 1 ? "shared-all" : "retry")
      ).trim() || "retry",
    publishAt: String(post?.publish_at || "").trim() || null,
    duplicateKey: String(post?.duplicateKey || "").trim() || null,
    retryAttemptCount: Math.max(
      0,
      Number(post?.failure?.retryAttemptCount || 0) || 0
    ),
    nextRetryAt: String(post?.failure?.nextRetryAt || "").trim() || null,
    urlWatcherEnabled: normalizeBoolean(post?.urlWatcherEnabled, false),
  };
}

export function buildRetryJobsFromFailedPosts(failedPosts = []) {
  if (!Array.isArray(failedPosts) || !failedPosts.length) {
    return [];
  }

  return failedPosts.map(buildRetryJobFromFailedPost).filter(Boolean);
}

function buildJobDuplicateKey({ campaignSlug, caption, publishAt, job }) {
  const targets = buildStoredTargetsFromJob(job);
  const resolvedCaption = String(caption || "").trim();
  const resolvedPublishAt = String(publishAt || "").trim();
  const sourceKey =
    String(job?.video?.name || "").trim() ||
    path.basename(
      String(job?.sourceFilePath || job?.video?.path || "").trim()
    );

  if (!campaignSlug || !targets.length || !resolvedCaption || !resolvedPublishAt) {
    return null;
  }

  return buildPostDuplicateKey({
    campaignSlug,
    content: resolvedCaption,
    publish_at: resolvedPublishAt,
    targets,
    sourceKey,
  });
}

function isAlreadyScheduledError(error) {
  const message = String(error?.message || "").trim().toLowerCase();

  return message.includes("already scheduled");
}

function isDuplicateKeyError(error) {
  const message = String(error?.message || "").trim().toLowerCase();

  return message.includes("duplicate key error") || message.includes("e11000");
}

function isRetryableBulkPublishError(error) {
  const status = Number(error?.response?.status || 0);
  const code = String(
    error?.code || error?.cause?.code || error?.errno || ""
  )
    .trim()
    .toUpperCase();
  const message = String(error?.message || "").trim().toLowerCase();

  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false;
  }

  if (code === "ENOTFOUND" || message.includes("enotfound")) {
    return false;
  }

  if (isAlreadyScheduledError(error) || isDuplicateKeyError(error)) {
    return false;
  }

  return true;
}

function buildFailedJobEntry(
  job,
  publishAt,
  error,
  caption = "",
  campaignSlug = ""
) {
  const targets = buildJobTargets(job?.targets);
  const primaryTarget = targets[0] || null;
  const duplicateKey = buildJobDuplicateKey({
    campaignSlug,
    caption,
    publishAt,
    job,
  });

  return {
    videoName: String(job?.video?.name || "").trim() || null,
    videoPath: String(job?.video?.path || "").trim() || null,
    caption: String(caption || "").trim() || null,
    accountId: targets.length === 1 ? primaryTarget?.id || null : null,
    username: targets.length === 1 ? primaryTarget?.username || null : null,
    platform: targets.length === 1 ? primaryTarget?.platform || null : null,
    status: targets.length === 1 ? primaryTarget?.status || null : null,
    targets,
    targetCount: targets.length,
    matchType: String(job?.matchType || "").trim() || null,
    publishAt: String(publishAt || "").trim() || null,
    duplicateKey: duplicateKey || String(job?.duplicateKey || "").trim() || null,
    retryAttemptCount: Math.max(
      0,
      Number(job?.retryAttemptCount || 0) || 0
    ),
    nextRetryAt: String(job?.nextRetryAt || "").trim() || null,
    urlWatcherEnabled: normalizeBoolean(job?.urlWatcherEnabled, false),
    error: String(error?.message || error || "Unknown error").trim(),
  };
}

function buildFailedJobIdentity(entry) {
  const duplicateKey = String(entry?.duplicateKey || "").trim();

  if (duplicateKey) {
    return duplicateKey;
  }

  return [
    String(entry?.videoPath || "").trim(),
    buildTargetSignature(entry?.targets),
    String(entry?.publishAt || "").trim(),
    String(entry?.caption || "").trim(),
  ].join("|");
}

function upsertFailedJobEntry(entries, entry) {
  const nextEntry = entry ? { ...entry } : null;

  if (!nextEntry) {
    return Array.isArray(entries) ? [...entries] : [];
  }

  const identity = buildFailedJobIdentity(nextEntry);
  const existingEntries = Array.isArray(entries) ? [...entries] : [];
  const nextEntries = existingEntries.filter(
    (item) => buildFailedJobIdentity(item) !== identity
  );

  nextEntries.push(nextEntry);
  return nextEntries;
}

function removeFailedJobEntry(entries, entry) {
  const identity = buildFailedJobIdentity(entry);

  return Array.isArray(entries)
    ? entries.filter((item) => buildFailedJobIdentity(item) !== identity)
    : [];
}

function buildJobQueueItem(job, index) {
  const nextRetryAtMs = Date.parse(String(job?.nextRetryAt || "").trim());

  return {
    ...job,
    queueIndex: index,
    retryAttemptCount: Math.max(
      0,
      Number(job?.retryAttemptCount || 0) || 0
    ),
    nextRetryAt: Number.isNaN(nextRetryAtMs) ? null : nextRetryAtMs,
  };
}

function getRetryDelayMs(retryAttemptCount) {
  const exponent = Math.max(0, Number(retryAttemptCount || 1) - 1);

  return Math.min(
    BULK_PUBLISH_RETRY_MAX_DELAY_MS,
    BULK_PUBLISH_RETRY_BASE_DELAY_MS * 2 ** exponent
  );
}

function getNextRetryAtIso(queue) {
  const nextRetryMs = Array.isArray(queue)
    ? queue
        .map((job) => Number(job?.nextRetryAt || 0))
        .filter((value) => Number.isFinite(value) && value > Date.now())
        .sort((left, right) => left - right)[0]
    : null;

  return nextRetryMs ? new Date(nextRetryMs).toISOString() : null;
}

function buildRunningProgressSnapshot({
  progress,
  latestProgress,
  completedCount,
  failedJobs,
  totalCount,
  totalFiles,
  matchedCount,
  skippedVideos,
  missingAccounts,
  campaignSlug,
  caption,
  publishAt,
  publishMode,
  videoDir,
  urlWatcherEnabled,
  retryJobs,
  retrySourceRunId,
  retryAttemptCount,
  nextRetryAt,
  lastProcessedVideo,
  lastProcessedUsername,
  lastError = null,
}) {
  const unresolvedFailedJobs = Array.isArray(failedJobs) ? failedJobs : [];
  const safeCompletedCount = Math.max(0, Number(completedCount || 0) || 0);
  const safeTotalCount = Math.max(0, Number(totalCount || 0) || 0);
  const retryPendingCount = unresolvedFailedJobs.filter((entry) =>
    String(entry?.nextRetryAt || "").trim()
  ).length;
  const processedCount = Math.min(
    safeTotalCount,
    safeCompletedCount + unresolvedFailedJobs.length
  );

  return {
    ...(progress || {}),
    ...(latestProgress || {}),
    videoIndex: Math.min(
      safeTotalCount,
      safeCompletedCount + unresolvedFailedJobs.length
    ),
    completedCount: safeCompletedCount,
    processedCount,
    failedCount: unresolvedFailedJobs.length,
    totalCount: safeTotalCount,
    totalFiles,
    matchedCount,
    skippedVideoCount: skippedVideos.length,
    missingAccountCount: missingAccounts.length,
    percentage: safeTotalCount
      ? Math.floor((safeCompletedCount / safeTotalCount) * 100)
      : 0,
    status: "running",
    completed: false,
    campaignSlug,
    caption,
    publishAt,
    publishMode,
    videoDir,
    urlWatcherEnabled: normalizeBoolean(urlWatcherEnabled, false),
    failedJobSamples: unresolvedFailedJobs
      .slice(0, 8)
      .map(formatFailedJobSample),
    failedJobs: unresolvedFailedJobs,
    skippedVideoSamples: skippedVideos
      .slice(0, 8)
      .map((item) => `${item.name}: ${item.reason}`),
    missingAccountSamples: missingAccounts.slice(0, 8),
    retryJobs,
    retrySourceRunId,
    retryAttemptCount: Math.max(
      0,
      Number(retryAttemptCount || 0) || 0
    ),
    retryPendingCount,
    nextRetryAt: nextRetryAt || null,
    lastProcessedVideo: lastProcessedVideo || null,
    lastProcessedUsername: lastProcessedUsername || null,
    lastError: lastError || null,
    error: null,
    finishedAt: null,
  };
}

async function waitForRetrySlot({ runId, signal, nextRetryAt }) {
  const retryAtMs = Number(nextRetryAt || 0);

  while (Number.isFinite(retryAtMs) && retryAtMs > Date.now()) {
    throwIfBulkPublishAborted(signal);

    const latestProgress = await loadProgress(runId);

    if (isCancellationRequested(latestProgress)) {
      return false;
    }

    const remainingMs = retryAtMs - Date.now();

    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(
          0,
          Math.min(BULK_PUBLISH_RETRY_WAIT_STEP_MS, remainingMs)
        )
      )
    );
  }

  return true;
}

async function findBlockingDuplicateForJob({
  campaignSlug,
  caption,
  publishAt,
  job,
}) {
  const duplicateKey = buildJobDuplicateKey({
    campaignSlug,
    caption,
    publishAt,
    job,
  });

  if (!duplicateKey) {
    return null;
  }

  const existingPost = await findDuplicatePost(duplicateKey);

  return isBlockingDuplicatePost(existingPost) ? existingPost : null;
}

function formatFailedJobSample(entry) {
  const videoName = String(entry?.videoName || "Unknown video").trim();
  const targetLabel = formatTargetLabel(
    Array.isArray(entry?.targets) ? entry.targets : entry?.accountId
      ? [{ account_id: entry.accountId, username: entry.username }]
      : []
  );
  const error = String(entry?.error || "Unknown error").trim();
  const targetCopy = targetLabel ? ` -> ${targetLabel}` : "";

  return `${videoName}${targetCopy}: ${error}`;
}

async function persistBulkPublishFailure({
  campaign,
  campaignSlug,
  runId,
  retrySourceRunId,
  job,
  caption,
  publishAt,
  urlWatcherEnabled,
  error,
}) {
  const duplicateKey = buildJobDuplicateKey({
    campaignSlug,
    caption,
    publishAt,
    job,
  });

  if (!duplicateKey) {
    return null;
  }

  return persistFailedPostRecord({
    campaignSlug,
    campaignType: campaign?.campaignType,
    content: caption,
    publish_at: publishAt,
    targets: buildStoredTargetsFromJob(job),
    source_file_path: String(job?.sourceFilePath || job?.video?.path || "").trim() || null,
    origin: "bulk_queue",
    duplicateKey,
    urlWatcherEnabled: normalizeBoolean(urlWatcherEnabled, false),
    failure: {
      message: String(error?.message || error || "Unknown error").trim(),
      runId,
      retrySourceRunId,
      videoName: String(job?.video?.name || "").trim() || null,
      videoPath:
        String(job?.sourceFilePath || job?.video?.path || "").trim() || null,
      matchType: String(job?.matchType || "").trim() || null,
      retryAttemptCount: Math.max(
        0,
        Number(job?.retryAttemptCount || 0) || 0
      ),
      nextRetryAt: String(job?.nextRetryAt || "").trim() || null,
    },
  });
}

async function filterRetryableFailedJobEntries({
  failedJobEntries,
  campaignSlug,
  caption,
}) {
  if (!Array.isArray(failedJobEntries) || !failedJobEntries.length) {
    return [];
  }

  const retryableEntries = await Promise.all(
    failedJobEntries.map(async (entry) => {
      const targets = buildJobTargets(
        Array.isArray(entry?.targets)
          ? entry.targets
          : entry?.accountId
            ? [{
                account_id: entry.accountId,
                username: entry.username,
                platform: entry.platform,
                status: entry.status,
              }]
            : []
      );
      const publishAt = String(entry?.publishAt || "").trim();
      const videoPath = String(entry?.videoPath || "").trim();
      const entryCaption = String(entry?.caption || caption || "").trim();

      if (!targets.length || !publishAt || !videoPath || !entryCaption) {
        return null;
      }

      const duplicateKey =
        String(entry?.duplicateKey || "").trim() ||
        buildPostDuplicateKey({
          campaignSlug,
          content: entryCaption,
          publish_at: publishAt,
          targets,
        });
      const existingPost = await findDuplicatePost(duplicateKey);

      return isBlockingDuplicatePost(existingPost)
        ? null
        : {
            ...entry,
            duplicateKey,
          };
    })
  );

  return retryableEntries.filter(Boolean);
}

async function rebuildRetryableFailedJobEntries(progress) {
  const campaignSlug = String(progress?.campaignSlug || "").trim();
  const caption = String(progress?.caption || "").trim();
  const publishAt = String(progress?.publishAt || "").trim();
  const urlWatcherEnabled = normalizeBoolean(progress?.urlWatcherEnabled, false);
  const videoDir = String(progress?.videoDir || "").trim();

  if (!campaignSlug || !caption || !publishAt || !videoDir) {
    return [];
  }

  const videos = loadBulkPublishSourceFiles(videoDir);

  if (!videos.length) {
    return [];
  }

  const accounts = await getAccounts({ campaignSlug });

  if (!accounts.length) {
    return [];
  }

  const { matchedJobs } = buildJobsForPublishMode(
    videos,
    accounts,
    resolveBulkPublishCaptions(caption, videos.length, {
      allowSingle: true,
    })
  );

  if (!matchedJobs.length) {
    return [];
  }

  const rebuiltFailedJobEntries = matchedJobs.map((job, index) =>
    buildFailedJobEntry(
      { ...job, urlWatcherEnabled },
      resolvePublishAtForIndex(publishAt),
      "Retry candidate reconstructed from original bulk publish run",
      caption,
      campaignSlug
    )
  );

  return filterRetryableFailedJobEntries({
    failedJobEntries: rebuiltFailedJobEntries,
    campaignSlug,
    caption,
  });
}

export async function resolveRetryableFailedJobs(progress) {
  const storedFailedJobs = Array.isArray(progress?.failedJobs)
    ? progress.failedJobs
    : [];
  const campaignSlug = String(progress?.campaignSlug || "").trim();
  const caption = String(progress?.caption || "").trim();
  const duplicateKeys = storedFailedJobs
    .map((entry) => String(entry?.duplicateKey || "").trim())
    .filter(Boolean);

  if (duplicateKeys.length) {
    const failedPosts = await listFailedPostsByDuplicateKeys(duplicateKeys);
    const retryJobsFromFailedPosts = buildRetryJobsFromFailedPosts(failedPosts);

    if (retryJobsFromFailedPosts.length) {
      return retryJobsFromFailedPosts;
    }
  }

  if (storedFailedJobs.length) {
    return filterRetryableFailedJobEntries({
      failedJobEntries: storedFailedJobs,
      campaignSlug,
      caption,
    });
  }

  if (Number(progress?.failedCount || 0) <= 0) {
    return [];
  }

  const failedPostsForRun = await listFailedPosts({
    campaignSlug,
    runId: String(progress?.runId || "").trim(),
  });
  const retryJobsFromRunFailedPosts =
    buildRetryJobsFromFailedPosts(failedPostsForRun);

  if (retryJobsFromRunFailedPosts.length) {
    return retryJobsFromRunFailedPosts;
  }

  return rebuildRetryableFailedJobEntries(progress);
}

function resolvePublishAtForIndex(basePublishAt) {
  const baseEastern = DateTime.fromISO(String(basePublishAt), {
    zone: "utc",
  }).setZone(EASTERN_TIMEZONE);

  if (!baseEastern.isValid) {
    throw new Error("Invalid publishAt value");
  }

  return baseEastern.toUTC().toISO({ suppressMilliseconds: false });
}

async function resolveAutomaticBasePublishAt(campaignSlug) {
  const latestPublishAt = await getLatestCampaignPublishAt(campaignSlug);

  return easternDateTimeInputToIso(
    getDefaultBulkPublishDateTimeInput(latestPublishAt, 2)
  );
}

export async function bulkPublishPipeline({
  runId,
  caption,
  publishAt,
  publishMode = "same-time",
  videoDir,
  urlWatcherEnabled = false,
  campaignSlug,
  retryJobs = [],
  retrySourceRunId = null,
}) {
  let progress = null;
  const controller = registerBulkPublishRun(runId);
  const signal = controller.signal;

  try {
    throwIfBulkPublishAborted(signal);

    if (!runId) {
      throw new Error("runId is required");
    }

    if (!campaignSlug) {
      throw new Error("campaignSlug is required");
    }

    const resolvedCaption = String(caption || "").trim();

    if (!resolvedCaption) {
      throw new Error("caption is required");
    }

    const resolvedPublishAtInput = String(publishAt || "").trim();
    const resolvedPublishMode = normalizeBulkPublishMode(publishMode);
    const resolvedUrlWatcherEnabled = normalizeBoolean(urlWatcherEnabled, false);
    const resolvedRetryJobs = buildRetryJobs(retryJobs);
    const isRetryRun = resolvedRetryJobs.length > 0;

    if (!videoDir && !isRetryRun) {
      throw new Error("videoDir is required");
    }

    throwIfBulkPublishAborted(signal);
    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const sourceFiles = isRetryRun
      ? resolvedRetryJobs.map((job) => job.video)
      : loadBulkPublishSourceFiles(videoDir);

    if (!sourceFiles.length) {
      throw new Error(
        isRetryRun
          ? "No failed bulk publish items are available to retry"
          : "No videos found"
      );
    }

    let matchedJobs = [];
    let skippedVideos = [];
    let missingAccounts = [];
    let accounts = [];

    if (isRetryRun) {
      matchedJobs = resolvedRetryJobs;
    } else {
      throwIfBulkPublishAborted(signal);
      accounts = await getAccounts({ campaignSlug });

      if (!accounts.length) {
        throw new Error("No accounts");
      }

      ({ matchedJobs, skippedVideos, missingAccounts } =
        buildJobsForPublishMode(
          sourceFiles,
          accounts,
          resolveBulkPublishCaptions(resolvedCaption, sourceFiles.length, {
            allowSingle: true,
          })
        ));
    }

    if (!matchedJobs.length) {
      throw new Error(
        isRetryRun
          ? "No failed bulk publish items are available to retry"
          : "No videos could be paired with assigned campaign accounts"
      );
    }

    const resolvedPublishAt =
      resolvedPublishAtInput || (await resolveAutomaticBasePublishAt(campaignSlug));

    if (!resolvedPublishAt || Number.isNaN(new Date(resolvedPublishAt).getTime())) {
      throw new Error("Unable to resolve the next publish time");
    }

    const totalCount = matchedJobs.length;
    const queuedProgress = await loadProgress(runId);

    if (isCancellationRequested(queuedProgress)) {
      await saveCancelledProgress(queuedProgress, {
        runId,
        campaignSlug,
        caption: resolvedCaption,
        publishAt: resolvedPublishAt,
        publishMode: resolvedPublishMode,
        urlWatcherEnabled: resolvedUrlWatcherEnabled,
        videoDir,
        totalFiles: sourceFiles.length,
        matchedCount: matchedJobs.length,
        skippedVideoCount: skippedVideos.length,
        missingAccountCount: missingAccounts.length,
        totalCount,
        retryJobs: resolvedRetryJobs,
        retrySourceRunId,
      });
      return;
    }

    const initialRetryAttemptCount = matchedJobs.reduce(
      (sum, job) => sum + Math.max(0, Number(job?.retryAttemptCount || 0) || 0),
      0
    );

    await resetProgress(runId, {
      campaignSlug,
      caption: resolvedCaption,
      publishAt: resolvedPublishAt,
      publishMode: resolvedPublishMode,
      urlWatcherEnabled: resolvedUrlWatcherEnabled,
      videoDir,
      totalFiles: sourceFiles.length,
      matchedCount: matchedJobs.length,
      skippedVideoCount: skippedVideos.length,
      missingAccountCount: missingAccounts.length,
      totalCount,
      processedCount: 0,
      failedCount: 0,
      status: "running",
      cancelRequested: false,
      cancelRequestedAt: null,
      failedJobSamples: [],
      failedJobs: [],
      skippedVideoSamples: skippedVideos
        .slice(0, 8)
        .map((item) => `${item.name}: ${item.reason}`),
      missingAccountSamples: missingAccounts.slice(0, 8),
      error: null,
      lastError: null,
      retryJobs: resolvedRetryJobs,
      retrySourceRunId,
      retryAttemptCount: initialRetryAttemptCount,
      retryPendingCount: 0,
      nextRetryAt: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });

    progress = await loadProgress(runId);
    let completedCount = progress.completedCount || 0;
    let failedJobs = Array.isArray(progress.failedJobs)
      ? [...progress.failedJobs]
      : [];
    let retryAttemptCount = Math.max(
      initialRetryAttemptCount,
      Number(progress.retryAttemptCount || 0) || 0
    );
    let lastError = progress.lastError || null;
    let lastProcessedVideo = null;
    let lastProcessedUsername = null;
    const pendingJobs = matchedJobs.map(buildJobQueueItem);
    const workerCount = Math.max(
      1,
      Math.min(resolveBulkPublishWorkerCount(), pendingJobs.length || 1)
    );
    let stopRequested = false;
    let dirtyProgressItemCount = 0;
    let lastProgressFlushAt = 0;
    let lastControlPollAt = 0;
    let latestKnownProgress = progress;
    let progressFlushPromise = Promise.resolve();

    function buildCurrentProgressSnapshot(latestProgress) {
      return buildRunningProgressSnapshot({
        progress,
        latestProgress,
        completedCount,
        failedJobs,
        totalCount,
        totalFiles: sourceFiles.length,
        matchedCount: matchedJobs.length,
        skippedVideos,
        missingAccounts,
        campaignSlug,
        caption: resolvedCaption,
        publishAt: resolvedPublishAt,
        publishMode: resolvedPublishMode,
        urlWatcherEnabled: resolvedUrlWatcherEnabled,
        videoDir,
        retryJobs: resolvedRetryJobs,
        retrySourceRunId,
        retryAttemptCount,
        nextRetryAt: getNextRetryAtIso(pendingJobs),
        lastProcessedVideo,
        lastProcessedUsername,
        lastError,
      });
    }

    async function refreshLatestProgress(force = false) {
      const now = Date.now();

      if (
        !force &&
        latestKnownProgress?.runId &&
        now - lastControlPollAt < BULK_PUBLISH_CONTROL_POLL_INTERVAL_MS
      ) {
        return latestKnownProgress;
      }

      latestKnownProgress = await loadProgress(runId);
      lastControlPollAt = now;
      return latestKnownProgress;
    }

    async function flushRunningProgress(force = false) {
      if (
        !force &&
        dirtyProgressItemCount < BULK_PUBLISH_PROGRESS_FLUSH_BATCH_SIZE &&
        Date.now() - lastProgressFlushAt < BULK_PUBLISH_PROGRESS_FLUSH_INTERVAL_MS
      ) {
        return progress;
      }

      progressFlushPromise = progressFlushPromise.then(async () => {
        const latestProgress = await refreshLatestProgress(force);

        if (isCancellationRequested(latestProgress)) {
          return latestProgress;
        }

        progress = buildCurrentProgressSnapshot(latestProgress);
        await saveProgress(progress);
        dirtyProgressItemCount = 0;
        lastProgressFlushAt = Date.now();
        latestKnownProgress = progress;
        return progress;
      });

      return progressFlushPromise;
    }

    async function processJob(job) {
      const publishAtForJob =
        job.publishAt ||
        resolvePublishAtForIndex(resolvedPublishAt);
      const captionForJob = String(job?.caption || resolvedCaption).trim();
      const sourceFilePath = String(job?.video?.path || "").trim() || null;
      const jobUrlWatcherEnabled = normalizeBoolean(
        job?.urlWatcherEnabled,
        resolvedUrlWatcherEnabled
      );
      lastProcessedVideo = job?.video?.name || null;
      lastProcessedUsername = formatTargetLabel(job?.targets) || null;

      if (job.nextRetryAt) {
        const canContinue = await waitForRetrySlot({
          runId,
          signal,
          nextRetryAt: job.nextRetryAt,
        });

        if (!canContinue) {
          stopRequested = true;
          return;
        }
      }

      throwIfBulkPublishAborted(signal);

      try {
        const jobTargets = buildJobTargets(job?.targets);

        if (!jobTargets.length) {
          throw new Error("Bulk publish targets are missing");
        }

        const createdPosts = await publishVideo({
          file: {
            name:
              String(job?.video?.name || path.basename(sourceFilePath)).trim(),
            path: sourceFilePath,
          },
          accountIds: jobTargets.map((target) => target.id),
          accounts: isRetryRun ? jobTargets : accounts,
          content: captionForJob,
          publishAt: publishAtForJob,
          campaignSlug,
          sourceFilePath,
          origin: "bulk_queue",
          urlWatcherEnabled: jobUrlWatcherEnabled,
          signal,
        });

        completedCount += Math.max(
          1,
          Array.isArray(createdPosts) ? createdPosts.length : 1
        );
        failedJobs = removeFailedJobEntry(
          failedJobs,
          buildFailedJobEntry(
            { ...job, urlWatcherEnabled: jobUrlWatcherEnabled },
            publishAtForJob,
            "",
            captionForJob,
            campaignSlug
          )
        );

        if (!failedJobs.length) {
          lastError = null;
        }
      } catch (error) {
        if (isBulkPublishAbortError(error)) {
          throw error;
        }

        const blockingDuplicate = await findBlockingDuplicateForJob({
          campaignSlug,
          caption: captionForJob,
          publishAt: publishAtForJob,
          job,
        });

        if (blockingDuplicate || (isRetryRun && isAlreadyScheduledError(error))) {
          completedCount += 1;
          failedJobs = removeFailedJobEntry(
            failedJobs,
            buildFailedJobEntry(
              { ...job, urlWatcherEnabled: jobUrlWatcherEnabled },
              publishAtForJob,
              "",
              captionForJob,
              campaignSlug
            )
          );

          if (!failedJobs.length) {
            lastError = null;
          }

          console.warn(
            "bulk publish retry skipped duplicate scheduled post:",
            error.message
          );
        } else {
          const nextRetryAttemptCount =
            Math.max(0, Number(job?.retryAttemptCount || 0) || 0) + 1;
          const retryable =
            isRetryableBulkPublishError(error) &&
            nextRetryAttemptCount <= BULK_PUBLISH_MAX_RETRY_ATTEMPTS;
          const nextRetryAtMs = retryable
            ? Date.now() + getRetryDelayMs(nextRetryAttemptCount)
            : null;
          const retryJob = retryable
            ? {
                ...job,
                retryAttemptCount: nextRetryAttemptCount,
                nextRetryAt: nextRetryAtMs,
                urlWatcherEnabled: jobUrlWatcherEnabled,
              }
            : {
                ...job,
                retryAttemptCount: nextRetryAttemptCount,
                nextRetryAt: null,
                urlWatcherEnabled: jobUrlWatcherEnabled,
              };
          const failedJobEntry = buildFailedJobEntry(
            {
              ...retryJob,
              sourceFilePath,
              nextRetryAt: nextRetryAtMs
                ? new Date(nextRetryAtMs).toISOString()
                : null,
            },
            publishAtForJob,
            error,
            captionForJob,
            campaignSlug
          );

          retryAttemptCount += 1;
          failedJobs = upsertFailedJobEntry(failedJobs, failedJobEntry);

          await persistBulkPublishFailure({
            campaign,
            campaignSlug,
            runId,
            retrySourceRunId,
            job: {
              ...retryJob,
              sourceFilePath,
              nextRetryAt: nextRetryAtMs
                ? new Date(nextRetryAtMs).toISOString()
                : null,
            },
            caption: captionForJob,
            publishAt: publishAtForJob,
            urlWatcherEnabled: jobUrlWatcherEnabled,
            error,
          });

          lastError = formatFailedJobSample(failedJobEntry);

          if (retryable) {
            pendingJobs.push(retryJob);
            console.error("bulk publish item failed:", error.message);
          } else {
            console.error(
              "bulk publish item failed permanently:",
              error.message
            );
          }
        }
      }

      dirtyProgressItemCount += 1;
      await flushRunningProgress();
    }

    async function workerLoop() {
      while (!stopRequested) {
        const latestProgress = await refreshLatestProgress();

        if (isCancellationRequested(latestProgress)) {
          stopRequested = true;
          return;
        }

        throwIfBulkPublishAborted(signal);

        const job = pendingJobs.shift();

        if (!job) {
          return;
        }

        try {
          await processJob(job);
        } catch (error) {
          if (isBulkPublishAbortError(error)) {
            stopRequested = true;
            return;
          }

          throw error;
        }
      }
    }

    await Promise.all(
      Array.from({ length: workerCount }, () => workerLoop())
    );
    await flushRunningProgress(true);

    if (stopRequested) {
      const latestAfterStop = await loadProgress(runId).catch(() => progress);

      if (isCancellationRequested(latestAfterStop) || signal.aborted) {
        progress = buildCurrentProgressSnapshot(latestAfterStop);
        await saveCancelledProgress(progress);
        return;
      }
    }

    const finalProgress = await loadProgress(runId);

    if (isCancellationRequested(finalProgress)) {
      progress = buildRunningProgressSnapshot({
        progress,
        latestProgress: finalProgress,
        completedCount,
        failedJobs,
        totalCount,
        totalFiles: sourceFiles.length,
        matchedCount: matchedJobs.length,
        skippedVideos,
        missingAccounts,
        campaignSlug,
        caption: resolvedCaption,
        publishAt: resolvedPublishAt,
        publishMode: resolvedPublishMode,
        urlWatcherEnabled: resolvedUrlWatcherEnabled,
        videoDir,
        retryJobs: resolvedRetryJobs,
        retrySourceRunId,
        retryAttemptCount,
        nextRetryAt: null,
        lastProcessedVideo,
        lastProcessedUsername,
        lastError,
      });
      await saveCancelledProgress(progress);
      return;
    }

    const unresolvedFailures = Array.isArray(failedJobs) ? failedJobs : [];
    const hasUnresolvedFailures = unresolvedFailures.length > 0;

    progress = {
      ...buildRunningProgressSnapshot({
        progress,
        latestProgress: finalProgress,
        completedCount,
        failedJobs: unresolvedFailures,
        totalCount,
        totalFiles: sourceFiles.length,
        matchedCount: matchedJobs.length,
        skippedVideos,
        missingAccounts,
        campaignSlug,
        caption: resolvedCaption,
        publishAt: resolvedPublishAt,
        publishMode: resolvedPublishMode,
        urlWatcherEnabled: resolvedUrlWatcherEnabled,
        videoDir,
        retryJobs: resolvedRetryJobs,
        retrySourceRunId,
        retryAttemptCount,
        nextRetryAt: null,
        lastProcessedVideo,
        lastProcessedUsername,
        lastError: hasUnresolvedFailures ? lastError : null,
      }),
      percentage: hasUnresolvedFailures ? progress?.percentage ?? 0 : 100,
      completed: !hasUnresolvedFailures,
      status: hasUnresolvedFailures ? "failed" : "completed",
      cancelRequested: false,
      cancelRequestedAt: null,
      error: hasUnresolvedFailures
        ? `${unresolvedFailures.length} bulk publish item${
            unresolvedFailures.length === 1 ? "" : "s"
          } failed`
        : null,
      lastError: hasUnresolvedFailures ? lastError : null,
      finishedAt: new Date().toISOString(),
    };
    await saveProgress(progress);
  } catch (error) {
    console.error("pipeline error:", error.message);
    const latestProgress = await loadProgress(runId).catch(() => null);

    if (
      isBulkPublishAbortError(error) ||
      isCancellationRequested(latestProgress)
    ) {
      await saveCancelledProgress(latestProgress, {
        ...(progress || {}),
        runId,
        campaignSlug: campaignSlug || null,
        caption: String(caption || "").trim() || null,
        publishAt: String(publishAt || "").trim() || null,
        publishMode: normalizeBulkPublishMode(publishMode),
        urlWatcherEnabled: normalizeBoolean(urlWatcherEnabled, false),
        videoDir: videoDir || null,
        retryJobs: buildRetryJobs(retryJobs),
        retrySourceRunId,
      });
      return;
    }

    await saveProgress({
      ...(progress || {}),
      runId,
      completed: false,
      status: "failed",
      cancelRequested: false,
      error: error.message,
      lastError: progress?.lastError || null,
      percentage: progress?.percentage ?? 0,
      campaignSlug: campaignSlug || null,
      caption: String(caption || "").trim() || null,
      publishAt: String(publishAt || "").trim() || null,
      publishMode: normalizeBulkPublishMode(publishMode),
      urlWatcherEnabled: normalizeBoolean(urlWatcherEnabled, false),
      videoDir: videoDir || null,
      retryJobs: buildRetryJobs(retryJobs),
      retrySourceRunId,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    clearBulkPublishRun(runId);
  }
}
