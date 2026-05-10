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
  loadProgress,
  resetProgress,
  saveProgress,
} from "@/lib/utils/progressManager";
import { EASTERN_TIMEZONE } from "@/lib/utils/easternTime";

function isCancellationRequested(progress, campaignSlug) {
  if (!progress || progress.campaignSlug !== campaignSlug) {
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
  caption,
  publishAt,
  publishMode = "same-time",
  videoDir,
  campaignSlug,
}) {
  let progress = null;
  const controller = registerBulkPublishRun(campaignSlug);
  const signal = controller.signal;

  try {
    throwIfBulkPublishAborted(signal);

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

    if (!["same-time", "stagger-2h"].includes(resolvedPublishMode)) {
      throw new Error("Publish type is required");
    }

    if (!videoDir) {
      throw new Error("videoDir is required");
    }

    throwIfBulkPublishAborted(signal);
    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const videos = loadVideos(videoDir);

    if (!videos.length) {
      throw new Error("No videos found");
    }

    throwIfBulkPublishAborted(signal);
    const accounts = await getAccounts({ campaignSlug });

    if (!accounts.length) {
      throw new Error("No accounts");
    }

    const { matchedJobs, skippedVideos, missingAccounts } =
      buildJobsForPublishMode(videos, accounts, resolvedPublishMode);

    if (!matchedJobs.length) {
      throw new Error(
        resolvedPublishMode === "stagger-2h"
          ? "No videos could be assigned to campaign accounts in Every 2 hours mode"
          : "No filenames in the folder matched assigned campaign account usernames"
      );
    }

    const totalCount = matchedJobs.length;
    const queuedProgress = await loadProgress();

    if (isCancellationRequested(queuedProgress, campaignSlug)) {
      await saveCancelledProgress(queuedProgress, {
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
      });
      return;
    }

    await resetProgress({
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
      skippedVideoSamples: skippedVideos
        .slice(0, 8)
        .map((item) => `${item.name}: ${item.reason}`),
      missingAccountSamples: missingAccounts.slice(0, 8),
      error: null,
      lastError: null,
    });

    progress = await loadProgress();
    let completedCount = progress.completedCount || 0;
    let processedCount = progress.processedCount || 0;
    let failedCount = progress.failedCount || 0;

    for (let index = 0; index < matchedJobs.length; index += 1) {
      const job = matchedJobs[index];
      const latestProgress = await loadProgress();

      if (isCancellationRequested(latestProgress, campaignSlug)) {
        await saveCancelledProgress(latestProgress, {
          completedCount,
          processedCount,
          failedCount,
          totalCount,
          totalFiles: videos.length,
          matchedCount: matchedJobs.length,
          skippedVideoCount: skippedVideos.length,
          missingAccountCount: missingAccounts.length,
          campaignSlug,
          caption: resolvedCaption,
          publishAt: resolvedPublishAt,
          publishMode: resolvedPublishMode,
          videoDir,
        });
        return;
      }

      throwIfBulkPublishAborted(signal);

      const publishAtForJob = resolvePublishAtForIndex(
        resolvedPublishAt,
        index,
        resolvedPublishMode
      );

      try {
        const createdPosts = await publishVideo({
          file: job.video,
          accountIds: [job.account.id],
          accounts,
          content: resolvedCaption,
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
      } catch (error) {
        if (isBulkPublishAbortError(error)) {
          throw error;
        }

        failedCount += 1;
        progress.lastError = `${job.video.name}: ${error.message}`;
        console.error("bulk publish item failed:", error.message);
      }

      processedCount += 1;
      const latestAfterItem = await loadProgress();

      progress = {
        ...progress,
        ...latestAfterItem,
        videoIndex: index + 1,
        completedCount,
        processedCount,
        failedCount,
        totalCount,
        totalFiles: videos.length,
        matchedCount: matchedJobs.length,
        skippedVideoCount: skippedVideos.length,
        missingAccountCount: missingAccounts.length,
        percentage: Math.floor((processedCount / totalCount) * 100),
        status: "running",
        completed: false,
        campaignSlug,
        caption: resolvedCaption,
        publishAt: resolvedPublishAt,
        publishMode: resolvedPublishMode,
        videoDir,
        lastProcessedVideo: job.video.name,
        lastProcessedUsername: job.account.username || null,
        error: null,
      };

      if (isCancellationRequested(latestAfterItem, campaignSlug)) {
        await saveCancelledProgress(progress);
        return;
      }

      await saveProgress(progress);
    }

    const finalProgress = await loadProgress();

    if (isCancellationRequested(finalProgress, campaignSlug)) {
      await saveCancelledProgress(finalProgress, {
        completedCount,
        processedCount,
        failedCount,
        totalCount,
        totalFiles: videos.length,
        matchedCount: matchedJobs.length,
        skippedVideoCount: skippedVideos.length,
        missingAccountCount: missingAccounts.length,
        campaignSlug,
        caption: resolvedCaption,
        publishAt: resolvedPublishAt,
        publishMode: resolvedPublishMode,
        videoDir,
      });
      return;
    }

    progress.percentage = 100;
    progress.completed = true;
    progress.status = "completed";
    progress.cancelRequested = false;
    progress.cancelRequestedAt = null;
    progress.error = null;
    progress.caption = resolvedCaption;
    progress.publishAt = resolvedPublishAt;
    progress.publishMode = resolvedPublishMode;
    progress.totalFiles = videos.length;
    progress.matchedCount = matchedJobs.length;
    progress.skippedVideoCount = skippedVideos.length;
    progress.missingAccountCount = missingAccounts.length;
    progress.processedCount = processedCount;
    progress.failedCount = failedCount;
    progress.skippedVideoSamples = skippedVideos
      .slice(0, 8)
      .map((item) => `${item.name}: ${item.reason}`);
    progress.missingAccountSamples = missingAccounts.slice(0, 8);
    await saveProgress(progress);
  } catch (error) {
    console.error("pipeline error:", error.message);
    const latestProgress = await loadProgress().catch(() => null);

    if (
      isBulkPublishAbortError(error) ||
      isCancellationRequested(latestProgress, campaignSlug)
    ) {
      await saveCancelledProgress(latestProgress, {
        ...(progress || {}),
        campaignSlug: campaignSlug || null,
        caption: String(caption || "").trim() || null,
        publishAt: String(publishAt || "").trim() || null,
        publishMode: String(publishMode || "same-time").trim() || "same-time",
        videoDir: videoDir || null,
      });
      return;
    }

    await saveProgress({
      ...(progress || {}),
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
    });
  } finally {
    clearBulkPublishRun(campaignSlug);
  }
}
