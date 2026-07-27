import { randomUUID } from "crypto";

import { normalizeBoolean } from "@/lib/campaignNormalization";
import { getDb } from "@/lib/db";
import { normalizeAccountOrderMode } from "@/lib/pipeline/accountOrder";

const COLLECTION = "progress";
const JOB_ID = "bulk-publish";
const ACTIVE_PROGRESS_STATUSES = ["queued", "running", "cancelling"];

const DEFAULT_PROGRESS = {
  runId: null,
  accountIndex: 0,
  day: 0,
  postInDay: 0,
  videoIndex: 0,
  completedCount: 0,
  processedCount: 0,
  failedCount: 0,
  totalCount: 0,
  totalFiles: 0,
  matchedCount: 0,
  skippedVideoCount: 0,
  missingAccountCount: 0,
  percentage: 0,
  completed: false,
  status: "idle",
  campaignSlug: null,
  caption: null,
  publishAt: null,
  publishMode: "same-time",
  accountOrderMode: "folder-order",
  accountOrderSeed: null,
  urlWatcherEnabled: false,
  videoDir: null,
  cancelRequested: false,
  cancelRequestedAt: null,
  lastProcessedVideo: null,
  lastProcessedUsername: null,
  lastError: null,
  failedJobSamples: [],
  failedJobs: [],
  skippedVideoSamples: [],
  missingAccountSamples: [],
  error: null,
  retryJobs: [],
  retrySourceRunId: null,
  retryAttemptCount: 0,
  retryPendingCount: 0,
  nextRetryAt: null,
  workerClaimedAt: null,
  queuedAt: null,
  createdAt: null,
  updatedAt: null,
  startedAt: null,
  finishedAt: null,
};

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizeProgress(progress) {
  if (!progress) {
    return { ...DEFAULT_PROGRESS };
  }

  return {
    ...DEFAULT_PROGRESS,
    runId: progress.runId || null,
    accountIndex: progress.accountIndex ?? 0,
    day: progress.day ?? 0,
    postInDay: progress.postInDay ?? 0,
    videoIndex: progress.videoIndex ?? 0,
    completedCount: progress.completedCount ?? 0,
    processedCount: progress.processedCount ?? 0,
    failedCount: progress.failedCount ?? 0,
    totalCount: progress.totalCount ?? 0,
    totalFiles: progress.totalFiles ?? 0,
    matchedCount: progress.matchedCount ?? 0,
    skippedVideoCount: progress.skippedVideoCount ?? 0,
    missingAccountCount: progress.missingAccountCount ?? 0,
    percentage: progress.percentage ?? 0,
    completed: progress.completed ?? false,
    status: progress.status || "idle",
    campaignSlug: progress.campaignSlug || null,
    caption: progress.caption || null,
    publishAt: progress.publishAt || null,
    publishMode: progress.publishMode || "same-time",
    accountOrderMode: normalizeAccountOrderMode(progress.accountOrderMode),
    accountOrderSeed: progress.accountOrderSeed || null,
    urlWatcherEnabled: normalizeBoolean(progress.urlWatcherEnabled, false),
    videoDir: progress.videoDir || null,
    cancelRequested: progress.cancelRequested ?? false,
    cancelRequestedAt: progress.cancelRequestedAt || null,
    lastProcessedVideo: progress.lastProcessedVideo || null,
    lastProcessedUsername: progress.lastProcessedUsername || null,
    lastError: progress.lastError || null,
    failedJobSamples: Array.isArray(progress.failedJobSamples)
      ? progress.failedJobSamples
      : [],
    failedJobs: Array.isArray(progress.failedJobs) ? progress.failedJobs : [],
    skippedVideoSamples: Array.isArray(progress.skippedVideoSamples)
      ? progress.skippedVideoSamples
      : [],
    missingAccountSamples: Array.isArray(progress.missingAccountSamples)
      ? progress.missingAccountSamples
      : [],
    error: progress.error || null,
    retryJobs: Array.isArray(progress.retryJobs) ? progress.retryJobs : [],
    retrySourceRunId: progress.retrySourceRunId || null,
    retryAttemptCount: progress.retryAttemptCount ?? 0,
    retryPendingCount: progress.retryPendingCount ?? 0,
    nextRetryAt: toIsoString(progress.nextRetryAt),
    workerClaimedAt: toIsoString(progress.workerClaimedAt),
    queuedAt: toIsoString(progress.queuedAt),
    createdAt: toIsoString(progress.createdAt),
    updatedAt: toIsoString(progress.updatedAt),
    startedAt: toIsoString(progress.startedAt),
    finishedAt: toIsoString(progress.finishedAt),
  };
}

function toStoredProgress(progress) {
  const normalizedProgress = normalizeProgress(progress);
  const now = new Date();

  return {
    runId: normalizedProgress.runId,
    accountIndex: normalizedProgress.accountIndex,
    day: normalizedProgress.day,
    postInDay: normalizedProgress.postInDay,
    videoIndex: normalizedProgress.videoIndex,
    completedCount: normalizedProgress.completedCount,
    processedCount: normalizedProgress.processedCount,
    failedCount: normalizedProgress.failedCount,
    totalCount: normalizedProgress.totalCount,
    totalFiles: normalizedProgress.totalFiles,
    matchedCount: normalizedProgress.matchedCount,
    skippedVideoCount: normalizedProgress.skippedVideoCount,
    missingAccountCount: normalizedProgress.missingAccountCount,
    percentage: normalizedProgress.percentage,
    completed: normalizedProgress.completed,
    status: normalizedProgress.status,
    campaignSlug: normalizedProgress.campaignSlug,
    caption: normalizedProgress.caption,
    publishAt: normalizedProgress.publishAt,
    publishMode: normalizedProgress.publishMode,
    accountOrderMode: normalizedProgress.accountOrderMode,
    accountOrderSeed: normalizedProgress.accountOrderSeed,
    urlWatcherEnabled: normalizedProgress.urlWatcherEnabled,
    videoDir: normalizedProgress.videoDir,
    cancelRequested: normalizedProgress.cancelRequested,
    cancelRequestedAt: normalizedProgress.cancelRequestedAt,
    lastProcessedVideo: normalizedProgress.lastProcessedVideo,
    lastProcessedUsername: normalizedProgress.lastProcessedUsername,
    lastError: normalizedProgress.lastError,
    failedJobSamples: normalizedProgress.failedJobSamples,
    failedJobs: normalizedProgress.failedJobs,
    skippedVideoSamples: normalizedProgress.skippedVideoSamples,
    missingAccountSamples: normalizedProgress.missingAccountSamples,
    error: normalizedProgress.error,
    retryJobs: normalizedProgress.retryJobs,
    retrySourceRunId: normalizedProgress.retrySourceRunId,
    retryAttemptCount: normalizedProgress.retryAttemptCount,
    retryPendingCount: normalizedProgress.retryPendingCount,
    nextRetryAt: toDate(normalizedProgress.nextRetryAt),
    workerClaimedAt: toDate(normalizedProgress.workerClaimedAt),
    queuedAt: toDate(normalizedProgress.queuedAt) || now,
    createdAt: toDate(normalizedProgress.createdAt) || now,
    updatedAt: toDate(normalizedProgress.updatedAt) || now,
    startedAt: toDate(normalizedProgress.startedAt),
    finishedAt: toDate(normalizedProgress.finishedAt),
    jobId: JOB_ID,
  };
}

function buildFilter({ campaignSlug = "", runId = "", statuses = [] } = {}) {
  const filter = { jobId: JOB_ID };
  const normalizedRunId = String(runId || "").trim();
  const normalizedCampaignSlug = String(campaignSlug || "").trim();
  const normalizedStatuses = Array.isArray(statuses)
    ? statuses.map((status) => String(status || "").trim()).filter(Boolean)
    : [];

  if (normalizedRunId) {
    filter.runId = normalizedRunId;
  }

  if (normalizedCampaignSlug) {
    filter.campaignSlug = normalizedCampaignSlug;
  }

  if (normalizedStatuses.length) {
    filter.status = { $in: normalizedStatuses };
  }

  return filter;
}

function extractDocument(result) {
  if (!result) {
    return null;
  }

  if (result.value) {
    return result.value;
  }

  return result;
}

async function getCollection() {
  const db = await getDb();
  return db.collection(COLLECTION);
}

export function createDefaultProgress(overrides = {}) {
  return {
    ...DEFAULT_PROGRESS,
    ...overrides,
  };
}

export async function createProgress(overrides = {}) {
  const collection = await getCollection();
  const now = new Date();
  const progress = toStoredProgress({
    ...DEFAULT_PROGRESS,
    ...overrides,
    runId: randomUUID(),
    queuedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  await collection.insertOne(progress);
  return normalizeProgress(progress);
}

export async function loadProgress(runId) {
  const normalizedRunId = String(runId || "").trim();

  if (!normalizedRunId) {
    return createDefaultProgress();
  }

  const collection = await getCollection();
  const progress = await collection.findOne(buildFilter({ runId: normalizedRunId }));

  return normalizeProgress(progress);
}

export async function loadLatestProgress(options = {}) {
  const collection = await getCollection();
  const progress = await collection.findOne(buildFilter(options), {
    sort: { createdAt: -1, updatedAt: -1 },
  });

  return progress
    ? normalizeProgress(progress)
    : createDefaultProgress({
        campaignSlug: String(options?.campaignSlug || "").trim() || null,
      });
}

export async function listProgressRuns(options = {}) {
  const collection = await getCollection();
  const limit = Math.max(
    1,
    Math.min(100, Number.parseInt(String(options?.limit || "6"), 10) || 6)
  );
  const runs = await collection
    .find(buildFilter(options), {
      sort: { createdAt: -1, updatedAt: -1 },
      limit,
    })
    .toArray();

  return runs.map(normalizeProgress);
}

export async function deleteFinishedProgressRuns(options = {}) {
  const campaignSlug = String(options?.campaignSlug || "").trim();

  if (!campaignSlug) {
    throw new Error("Campaign slug is required");
  }

  const collection = await getCollection();
  const [activeRunsPreserved, result] = await Promise.all([
    collection.countDocuments(
      buildFilter({
        campaignSlug,
        statuses: ACTIVE_PROGRESS_STATUSES,
      })
    ),
    collection.deleteMany({
      ...buildFilter({ campaignSlug }),
      status: { $nin: ACTIVE_PROGRESS_STATUSES },
    }),
  ]);

  return {
    runsDeleted: result.deletedCount || 0,
    activeRunsPreserved,
  };
}

export async function saveProgress(progress) {
  const normalizedRunId = String(progress?.runId || "").trim();

  if (!normalizedRunId) {
    throw new Error("runId is required to save progress");
  }

  const collection = await getCollection();
  const hasStableTimestamps =
    Boolean(progress?.createdAt) && Boolean(progress?.queuedAt);
  const existingProgress = hasStableTimestamps
    ? null
    : await collection.findOne(buildFilter({ runId: normalizedRunId }), {
        projection: {
          _id: 0,
          createdAt: 1,
          queuedAt: 1,
        },
      });
  const safeProgress = toStoredProgress({
    ...progress,
    runId: normalizedRunId,
    createdAt: progress?.createdAt || existingProgress?.createdAt,
    queuedAt: progress?.queuedAt || existingProgress?.queuedAt,
    updatedAt: new Date(),
  });

  await collection.updateOne(
    buildFilter({ runId: normalizedRunId }),
    { $set: safeProgress },
    { upsert: true }
  );

  return normalizeProgress(safeProgress);
}

export async function resetProgress(runId, overrides = {}) {
  const normalizedRunId = String(runId || "").trim();

  if (!normalizedRunId) {
    throw new Error("runId is required to reset progress");
  }

  const existingProgress = await loadProgress(normalizedRunId);
  const now = new Date().toISOString();

  return saveProgress({
    ...DEFAULT_PROGRESS,
    ...overrides,
    runId: normalizedRunId,
    createdAt: existingProgress.createdAt || now,
    queuedAt: existingProgress.queuedAt || now,
    workerClaimedAt:
      overrides.workerClaimedAt ?? existingProgress.workerClaimedAt ?? null,
  });
}

export async function claimNextQueuedProgress() {
  const collection = await getCollection();
  const now = new Date();
  const result = await collection.findOneAndUpdate(
    {
      jobId: JOB_ID,
      status: "queued",
      workerClaimedAt: null,
      cancelRequested: { $ne: true },
    },
    {
      $set: {
        workerClaimedAt: now,
        updatedAt: now,
      },
    },
    {
      sort: { createdAt: 1 },
      returnDocument: "after",
    }
  );

  return normalizeProgress(extractDocument(result));
}
