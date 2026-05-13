import fs from "fs";
import path from "path";
import { DateTime } from "luxon";

import { getAccounts } from "@/lib/accounts/getAccounts";
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
import { listFailedPosts, listFailedPostsByDuplicateKeys } from "@/lib/post/queries/listPosts";
import {
  loadProgress,
  resetProgress,
  saveProgress,
} from "@/lib/utils/progressManager";
import { EASTERN_TIMEZONE } from "@/lib/utils/easternTime";

const BULK_PUBLISH_RETRY_BASE_DELAY_MS = 5 * 1000;
const BULK_PUBLISH_RETRY_MAX_DELAY_MS = 60 * 1000;
const BULK_PUBLISH_RETRY_WAIT_STEP_MS = 1000;

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

function loadVideos(dir) {
  const resolvedDir = path.resolve(String(dir || ""));

  if (!resolvedDir || !fs.existsSync(resolvedDir)) {
    throw new Error("Folder path not found");
  }

  const stat = fs.statSync(resolvedDir);
  if (!stat.isDirectory()) {
    throw new Error("Folder path must be a directory");
  }

  const files = fs.readdirSync(resolvedDir);

  return files
    .map((file) => {
      const fullPath = path.join(resolvedDir, file);
      const stat = fs.statSync(fullPath);

      if (!stat.isFile()) return null;

      const ext = path.extname(file).toLowerCase();
      if (![".mp4", ".mov", ".avi", ".mkv"].includes(ext)) {
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

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/^@+/, "");
}

function normalizeLooseKey(value) {
  return normalizeUsername(value).replace(/[^a-z0-9]/g, "");
}

function getVideoBaseName(fileName) {
  return path.basename(String(fileName || ""), path.extname(String(fileName || "")));
}

function addLookupValue(map, key, value) {
  if (!key) {
    return;
  }

  const current = map.get(key) || [];
  current.push(value);
  map.set(key, current);
}

function buildAccountLookup(accounts) {
  const exact = new Map();
  const loose = new Map();

  for (const account of accounts) {
    addLookupValue(exact, normalizeUsername(account?.username), account);
    addLookupValue(loose, normalizeLooseKey(account?.username), account);
  }

  return { exact, loose };
}

function resolveAccountForVideo(video, lookup) {
  const baseName = getVideoBaseName(video?.name);
  const exactKey = normalizeUsername(baseName);
  const exactMatches = lookup.exact.get(exactKey) || [];

  if (exactMatches.length === 1) {
    return { account: exactMatches[0], matchType: "exact" };
  }

  if (exactMatches.length > 1) {
    return {
      error: `Filename "${video.name}" matched multiple assigned accounts`,
    };
  }

  const looseKey = normalizeLooseKey(baseName);
  const looseMatches = lookup.loose.get(looseKey) || [];

  if (looseMatches.length === 1) {
    return { account: looseMatches[0], matchType: "loose" };
  }

  if (looseMatches.length > 1) {
    return {
      error: `Filename "${video.name}" loosely matched multiple assigned accounts`,
    };
  }

  return {
    error: `No assigned account matched filename "${video.name}"`,
  };
}

function buildMatchedJobs(videos, accounts) {
  const lookup = buildAccountLookup(accounts);
  const matchedJobs = [];
  const skippedVideos = [];
  const usedAccountIds = new Set();

  for (const video of videos) {
    const match = resolveAccountForVideo(video, lookup);

    if (!match.account) {
      skippedVideos.push({
        name: video.name,
        reason: match.error,
      });
      continue;
    }

    const accountId = String(match.account?.id || "").trim();

    if (!accountId) {
      skippedVideos.push({
        name: video.name,
        reason: `Matched account "${match.account?.username || "unknown"}" is missing an id`,
      });
      continue;
    }

    if (usedAccountIds.has(accountId)) {
      skippedVideos.push({
        name: video.name,
        reason: `Multiple files matched account "${match.account.username}"`,
      });
      continue;
    }

    usedAccountIds.add(accountId);
    matchedJobs.push({
      video,
      account: match.account,
      matchType: match.matchType,
    });
  }

  const matchedAccountIds = new Set(
    matchedJobs.map((job) => String(job.account?.id || "").trim()).filter(Boolean)
  );
  const missingAccounts = accounts
    .filter((account) => !matchedAccountIds.has(String(account?.id || "").trim()))
    .map((account) => String(account?.username || "").trim())
    .filter(Boolean);

  return {
    matchedJobs,
    skippedVideos,
    missingAccounts,
  };
}

function buildSequentialJobs(videos, accounts) {
  const matchedJobs = [];
  const skippedVideos = [];
  const invalidAccounts = [];
  const usableAccounts = [];

  for (const account of accounts) {
    const accountId = String(account?.id || "").trim();

    if (!accountId) {
      invalidAccounts.push(
        String(account?.username || "unknown").trim() || "unknown"
      );
      continue;
    }

    usableAccounts.push(account);
  }

  if (!usableAccounts.length) {
    return {
      matchedJobs,
      skippedVideos,
      missingAccounts: invalidAccounts,
    };
  }

  for (let index = 0; index < videos.length; index += 1) {
    matchedJobs.push({
      video: videos[index],
      account: usableAccounts[index % usableAccounts.length],
      matchType: "sequence",
    });
  }

  const missingAccounts = [
    ...invalidAccounts,
    ...usableAccounts
      .slice(Math.min(videos.length, usableAccounts.length))
      .map((account) => String(account?.username || "").trim())
      .filter(Boolean),
  ];

  return {
    matchedJobs,
    skippedVideos,
    missingAccounts,
  };
}

function buildJobsForPublishMode(videos, accounts, publishMode) {
  if (publishMode === "stagger-2h") {
    return buildSequentialJobs(videos, accounts);
  }

  return buildMatchedJobs(videos, accounts);
}

function buildRetryJobs(failedJobs) {
  if (!Array.isArray(failedJobs)) {
    return [];
  }

  return failedJobs
    .map((entry) => {
      const videoName = String(entry?.videoName || "").trim();
      const videoPath = String(entry?.videoPath || "").trim();
      const accountId = String(entry?.accountId || "").trim();
      const username = String(entry?.username || "").trim();

      if (!videoName && !videoPath) {
        return null;
      }

      return {
        video: {
          name: videoName || path.basename(videoPath),
          path: videoPath,
        },
        caption: String(entry?.caption || "").trim() || null,
        account: {
          id: accountId,
          username,
          platform: String(entry?.platform || "").trim(),
          status: String(entry?.status || "").trim(),
        },
        matchType: String(entry?.matchType || "retry").trim() || "retry",
        publishAt: String(entry?.publishAt || "").trim() || null,
        duplicateKey: String(entry?.duplicateKey || "").trim() || null,
        retryAttemptCount: Math.max(
          0,
          Number(entry?.retryAttemptCount || 0) || 0
        ),
        nextRetryAt: String(entry?.nextRetryAt || "").trim() || null,
      };
    })
    .filter(Boolean);
}

export function buildRetryJobFromFailedPost(post) {
  const videoPath =
    String(post?.source_file_path || post?.failure?.videoPath || "").trim() || null;
  const target = Array.isArray(post?.targets) ? post.targets[0] : null;
  const accountId = String(
    target?.account_id || target?.id || target?.accountId || ""
  ).trim();
  const username = String(target?.username || "").trim();

  if (!videoPath || !accountId) {
    return null;
  }

  return {
    videoName:
      String(post?.failure?.videoName || "").trim() || path.basename(videoPath),
    videoPath,
    caption: String(post?.content || "").trim() || null,
    accountId,
    username,
    platform: String(target?.platform || "").trim(),
    status: String(target?.status || "").trim(),
    matchType: "retry",
    publishAt: String(post?.publish_at || "").trim() || null,
    duplicateKey: String(post?.duplicateKey || "").trim() || null,
    retryAttemptCount: Math.max(
      0,
      Number(post?.failure?.retryAttemptCount || 0) || 0
    ),
    nextRetryAt: String(post?.failure?.nextRetryAt || "").trim() || null,
  };
}

export function buildRetryJobsFromFailedPosts(failedPosts = []) {
  if (!Array.isArray(failedPosts) || !failedPosts.length) {
    return [];
  }

  return failedPosts.map(buildRetryJobFromFailedPost).filter(Boolean);
}

function buildJobTarget(account) {
  return {
    account_id: String(account?.id || "").trim(),
    username: String(account?.username || "").trim(),
    platform: String(account?.platform || "").trim(),
    status: String(account?.status || "").trim(),
  };
}

function buildJobDuplicateKey({ campaignSlug, caption, publishAt, account }) {
  const accountId = String(account?.id || account?.account_id || "").trim();
  const resolvedCaption = String(caption || "").trim();
  const resolvedPublishAt = String(publishAt || "").trim();

  if (!campaignSlug || !accountId || !resolvedCaption || !resolvedPublishAt) {
    return null;
  }

  return buildPostDuplicateKey({
    campaignSlug,
    content: resolvedCaption,
    publish_at: resolvedPublishAt,
    targets: [{ account_id: accountId }],
  });
}

function isAlreadyScheduledError(error) {
  const message = String(error?.message || "").trim().toLowerCase();

  return message.includes("already scheduled");
}

function buildFailedJobEntry(
  job,
  publishAt,
  error,
  caption = "",
  campaignSlug = ""
) {
  const duplicateKey = buildJobDuplicateKey({
    campaignSlug,
    caption,
    publishAt,
    account: job?.account,
  });

  return {
    videoName: String(job?.video?.name || "").trim() || null,
    videoPath: String(job?.video?.path || "").trim() || null,
    caption: String(caption || "").trim() || null,
    accountId: String(job?.account?.id || "").trim() || null,
    username: String(job?.account?.username || "").trim() || null,
    platform: String(job?.account?.platform || "").trim() || null,
    status: String(job?.account?.status || "").trim() || null,
    matchType: String(job?.matchType || "").trim() || null,
    publishAt: String(publishAt || "").trim() || null,
    duplicateKey: duplicateKey || String(job?.duplicateKey || "").trim() || null,
    retryAttemptCount: Math.max(
      0,
      Number(job?.retryAttemptCount || 0) || 0
    ),
    nextRetryAt: String(job?.nextRetryAt || "").trim() || null,
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
    String(entry?.accountId || "").trim(),
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

  return {
    ...(progress || {}),
    ...(latestProgress || {}),
    videoIndex: Math.min(
      safeTotalCount,
      safeCompletedCount + unresolvedFailedJobs.length
    ),
    completedCount: safeCompletedCount,
    processedCount: safeCompletedCount,
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
    retryPendingCount: unresolvedFailedJobs.length,
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
    account: job?.account,
  });

  if (!duplicateKey) {
    return null;
  }

  const existingPost = await findDuplicatePost(duplicateKey);

  return isBlockingDuplicatePost(existingPost) ? existingPost : null;
}

function formatFailedJobSample(entry) {
  const videoName = String(entry?.videoName || "Unknown video").trim();
  const username = String(entry?.username || "").trim();
  const error = String(entry?.error || "Unknown error").trim();
  const targetCopy = username ? ` -> ${username}` : "";

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
  error,
}) {
  const duplicateKey = buildJobDuplicateKey({
    campaignSlug,
    caption,
    publishAt,
    account: job?.account,
  });

  if (!duplicateKey) {
    return null;
  }

  return persistFailedPostRecord({
    campaignSlug,
    campaignType: campaign?.campaignType,
    campaignId: campaign?.campaignId,
    campaignPassword: campaign?.campaignPassword,
    content: caption,
    publish_at: publishAt,
    targets: [buildJobTarget(job?.account)],
    source_file_path: String(job?.video?.path || "").trim() || null,
    origin: "bulk_queue",
    duplicateKey,
    failure: {
      message: String(error?.message || error || "Unknown error").trim(),
      runId,
      retrySourceRunId,
      videoName: String(job?.video?.name || "").trim() || null,
      videoPath: String(job?.video?.path || "").trim() || null,
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
      const accountId = String(entry?.accountId || "").trim();
      const publishAt = String(entry?.publishAt || "").trim();
      const videoPath = String(entry?.videoPath || "").trim();
      const entryCaption = String(entry?.caption || caption || "").trim();

      if (!accountId || !publishAt || !videoPath || !entryCaption) {
        return null;
      }

      const duplicateKey =
        String(entry?.duplicateKey || "").trim() ||
        buildPostDuplicateKey({
          campaignSlug,
          content: entryCaption,
          publish_at: publishAt,
          targets: [{ account_id: accountId }],
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
  const publishMode = String(progress?.publishMode || "same-time").trim() || "same-time";
  const videoDir = String(progress?.videoDir || "").trim();

  if (!campaignSlug || !caption || !publishAt || !videoDir) {
    return [];
  }

  const videos = loadVideos(videoDir);

  if (!videos.length) {
    return [];
  }

  const accounts = await getAccounts({ campaignSlug });

  if (!accounts.length) {
    return [];
  }

  const { matchedJobs } = buildJobsForPublishMode(videos, accounts, publishMode);

  if (!matchedJobs.length) {
    return [];
  }

  const rebuiltFailedJobEntries = matchedJobs.map((job, index) =>
    buildFailedJobEntry(
      job,
      resolvePublishAtForIndex(publishAt, index, publishMode),
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

function resolvePublishAtForIndex(basePublishAt, index, publishMode) {
  if (publishMode !== "stagger-2h") {
    return basePublishAt;
  }

  const baseEastern = DateTime.fromISO(String(basePublishAt), {
    zone: "utc",
  }).setZone(EASTERN_TIMEZONE);

  if (!baseEastern.isValid) {
    throw new Error("Invalid publishAt value");
  }

  return baseEastern
    .plus({ hours: index * 2 })
    .toUTC()
    .toISO({ suppressMilliseconds: false });
}

export async function bulkPublishPipeline({
  runId,
  caption,
  publishAt,
  publishMode = "same-time",
  videoDir,
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

    const resolvedPublishAt = String(publishAt || "").trim();

    if (!resolvedPublishAt || Number.isNaN(new Date(resolvedPublishAt).getTime())) {
      throw new Error("publishAt is required");
    }

    const resolvedPublishMode = String(publishMode || "same-time").trim() || "same-time";
    const resolvedRetryJobs = buildRetryJobs(retryJobs);
    const isRetryRun = resolvedRetryJobs.length > 0;

    if (!["same-time", "stagger-2h"].includes(resolvedPublishMode)) {
      throw new Error("Publish type is required");
    }

    if (!videoDir && !isRetryRun) {
      throw new Error("videoDir is required");
    }

    throwIfBulkPublishAborted(signal);
    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const videos = isRetryRun
      ? resolvedRetryJobs.map((job) => job.video)
      : loadVideos(videoDir);

    if (!videos.length) {
      throw new Error(
        isRetryRun ? "No failed bulk publish items are available to retry" : "No videos found"
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
        buildJobsForPublishMode(videos, accounts, resolvedPublishMode));
    }

    if (!matchedJobs.length) {
      throw new Error(
        isRetryRun
          ? "No failed bulk publish items are available to retry"
          : resolvedPublishMode === "stagger-2h"
          ? "No videos could be assigned to campaign accounts in Every 2 hours mode"
          : "No filenames in the folder matched assigned campaign account usernames"
      );
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
        videoDir,
        totalFiles: videos.length,
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
      videoDir,
      totalFiles: videos.length,
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

    while (pendingJobs.length) {
      const job = pendingJobs.shift();
      const latestProgress = await loadProgress(runId);

      if (isCancellationRequested(latestProgress)) {
        progress = buildRunningProgressSnapshot({
          progress,
          latestProgress,
          completedCount,
          failedJobs,
          totalCount,
          totalFiles: videos.length,
          matchedCount: matchedJobs.length,
          skippedVideos,
          missingAccounts,
          campaignSlug,
          caption: resolvedCaption,
          publishAt: resolvedPublishAt,
          publishMode: resolvedPublishMode,
          videoDir,
          retryJobs: resolvedRetryJobs,
          retrySourceRunId,
          retryAttemptCount,
          nextRetryAt: getNextRetryAtIso([job, ...pendingJobs]),
          lastProcessedVideo,
          lastProcessedUsername,
          lastError,
        });
        await saveCancelledProgress(progress);
        return;
      }

      throwIfBulkPublishAborted(signal);

      const publishAtForJob =
        job.publishAt ||
        resolvePublishAtForIndex(
          resolvedPublishAt,
          Number(job?.queueIndex || 0),
          resolvedPublishMode
        );
      const captionForJob = String(job?.caption || resolvedCaption).trim();
      lastProcessedVideo = job?.video?.name || null;
      lastProcessedUsername = job?.account?.username || null;

      if (job.nextRetryAt) {
        const canContinue = await waitForRetrySlot({
          runId,
          signal,
          nextRetryAt: job.nextRetryAt,
        });

        if (!canContinue) {
          const latestAfterWait = await loadProgress(runId);

          progress = buildRunningProgressSnapshot({
            progress,
            latestProgress: latestAfterWait,
            completedCount,
            failedJobs,
            totalCount,
            totalFiles: videos.length,
            matchedCount: matchedJobs.length,
            skippedVideos,
            missingAccounts,
            campaignSlug,
            caption: resolvedCaption,
            publishAt: resolvedPublishAt,
            publishMode: resolvedPublishMode,
            videoDir,
            retryJobs: resolvedRetryJobs,
            retrySourceRunId,
            retryAttemptCount,
            nextRetryAt: getNextRetryAtIso([job, ...pendingJobs]),
            lastProcessedVideo,
            lastProcessedUsername,
            lastError,
          });
          await saveCancelledProgress(progress);
          return;
        }
      }

      throwIfBulkPublishAborted(signal);

      try {
        const createdPosts = await publishVideo({
          file: job.video,
          accountIds: [job.account.id],
          accounts: isRetryRun ? [job.account] : accounts,
          content: captionForJob,
          publishAt: publishAtForJob,
          campaignSlug,
          sourceFilePath: job.video.path,
          origin: "bulk_queue",
          signal,
        });

        completedCount += Math.max(
          1,
          Array.isArray(createdPosts) ? createdPosts.length : 1
        );
        failedJobs = removeFailedJobEntry(
          failedJobs,
          buildFailedJobEntry(
            job,
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
              job,
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
          const nextRetryAtMs =
            Date.now() + getRetryDelayMs(nextRetryAttemptCount);
          const retryJob = {
            ...job,
            retryAttemptCount: nextRetryAttemptCount,
            nextRetryAt: nextRetryAtMs,
          };
          const failedJobEntry = buildFailedJobEntry(
            {
              ...retryJob,
              nextRetryAt: new Date(nextRetryAtMs).toISOString(),
            },
            publishAtForJob,
            error,
            captionForJob,
            campaignSlug
          );

          retryAttemptCount += 1;
          failedJobs = upsertFailedJobEntry(failedJobs, failedJobEntry);
          pendingJobs.push(retryJob);
          await persistBulkPublishFailure({
            campaign,
            campaignSlug,
            runId,
            retrySourceRunId,
            job: {
              ...retryJob,
              nextRetryAt: new Date(nextRetryAtMs).toISOString(),
            },
            caption: captionForJob,
            publishAt: publishAtForJob,
            error,
          });
          lastError = formatFailedJobSample(failedJobEntry);
          console.error("bulk publish item failed:", error.message);
        }
      }

      const latestAfterItem = await loadProgress(runId);
      progress = buildRunningProgressSnapshot({
        progress,
        latestProgress: latestAfterItem,
        completedCount,
        failedJobs,
        totalCount,
        totalFiles: videos.length,
        matchedCount: matchedJobs.length,
        skippedVideos,
        missingAccounts,
        campaignSlug,
        caption: resolvedCaption,
        publishAt: resolvedPublishAt,
        publishMode: resolvedPublishMode,
        videoDir,
        retryJobs: resolvedRetryJobs,
        retrySourceRunId,
        retryAttemptCount,
        nextRetryAt: getNextRetryAtIso(pendingJobs),
        lastProcessedVideo,
        lastProcessedUsername,
        lastError,
      });

      if (isCancellationRequested(latestAfterItem)) {
        await saveCancelledProgress(progress);
        return;
      }

      await saveProgress(progress);
    }

    const finalProgress = await loadProgress(runId);

    if (isCancellationRequested(finalProgress)) {
      progress = buildRunningProgressSnapshot({
        progress,
        latestProgress: finalProgress,
        completedCount,
        failedJobs,
        totalCount,
        totalFiles: videos.length,
        matchedCount: matchedJobs.length,
        skippedVideos,
        missingAccounts,
        campaignSlug,
        caption: resolvedCaption,
        publishAt: resolvedPublishAt,
        publishMode: resolvedPublishMode,
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

    progress = {
      ...buildRunningProgressSnapshot({
        progress,
        latestProgress: finalProgress,
        completedCount,
        failedJobs: [],
        totalCount,
        totalFiles: videos.length,
        matchedCount: matchedJobs.length,
        skippedVideos,
        missingAccounts,
        campaignSlug,
        caption: resolvedCaption,
        publishAt: resolvedPublishAt,
        publishMode: resolvedPublishMode,
        videoDir,
        retryJobs: resolvedRetryJobs,
        retrySourceRunId,
        retryAttemptCount,
        nextRetryAt: null,
        lastProcessedVideo,
        lastProcessedUsername,
        lastError: null,
      }),
      percentage: 100,
      completed: true,
      status: "completed",
      cancelRequested: false,
      cancelRequestedAt: null,
      error: null,
      lastError: null,
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
        publishMode: String(publishMode || "same-time").trim() || "same-time",
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
      publishMode: String(publishMode || "same-time").trim() || "same-time",
      videoDir: videoDir || null,
      retryJobs: buildRetryJobs(retryJobs),
      retrySourceRunId,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    clearBulkPublishRun(runId);
  }
}
