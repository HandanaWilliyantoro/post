import os from "os";

import { bulkPublishPipeline } from "@/lib/pipeline/bulkPublish.pipeline";
import { hasActiveBulkPublishRun } from "@/lib/pipeline/bulkPublishRunRegistry";
import {
  claimNextQueuedProgress,
  listProgressRuns,
  loadProgress,
  saveProgress,
} from "@/lib/utils/progressManager";

const CPU_COUNT = Math.max(1, os.cpus()?.length || 1);
const DEFAULT_RUN_CONCURRENCY = Math.max(
  1,
  Math.min(2, Math.floor(CPU_COUNT / 4) || 1)
);
const BULK_PUBLISH_RUN_CONCURRENCY = Math.max(
  1,
  Number(process.env.BULK_PUBLISH_RUN_CONCURRENCY || DEFAULT_RUN_CONCURRENCY) ||
    DEFAULT_RUN_CONCURRENCY
);
const BULK_PUBLISH_STALE_RUN_GRACE_MS = Math.max(
  60 * 1000,
  Number(process.env.BULK_PUBLISH_STALE_RUN_GRACE_MS || 5 * 60 * 1000) ||
    5 * 60 * 1000
);
const BULK_PUBLISH_WATCHDOG_INTERVAL_MS = Math.max(
  15 * 1000,
  Number(
    process.env.BULK_PUBLISH_WATCHDOG_INTERVAL_MS || 30 * 1000
  ) || 30 * 1000
);
const ACTIVE_BULK_PUBLISH_STATUSES = ["queued", "running", "cancelling"];

let drainPromise = null;
let queueWakeRequested = false;
let watchdogTimer = null;
let recoveryPromise = null;

function getProgressTimestampMs(progress) {
  const rawValue =
    progress?.updatedAt ||
    progress?.startedAt ||
    progress?.workerClaimedAt ||
    progress?.createdAt ||
    "";
  const timestampMs = Date.parse(String(rawValue || "").trim());

  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function isOrphanedProgress(progress) {
  if (!progress?.runId || hasActiveBulkPublishRun(progress.runId)) {
    return false;
  }

  const status = String(progress.status || "").trim();

  if (
    progress.completed === true ||
    !ACTIVE_BULK_PUBLISH_STATUSES.includes(status)
  ) {
    return false;
  }

  if (status === "queued" && !progress.workerClaimedAt) {
    return false;
  }

  const timestampMs = getProgressTimestampMs(progress);

  if (!timestampMs) {
    return false;
  }

  return Date.now() - timestampMs >= BULK_PUBLISH_STALE_RUN_GRACE_MS;
}

async function recoverOrphanedProgress(progress) {
  if (!isOrphanedProgress(progress)) {
    return null;
  }

  const now = new Date().toISOString();

  if (progress.status === "cancelling" || progress.cancelRequested) {
    return saveProgress({
      ...progress,
      completed: false,
      status: "cancelled",
      cancelRequested: false,
      cancelRequestedAt: null,
      workerClaimedAt: null,
      error: null,
      finishedAt: progress.finishedAt || now,
    });
  }

  return saveProgress({
    ...progress,
    completed: false,
    status: "queued",
    cancelRequested: false,
    cancelRequestedAt: null,
    workerClaimedAt: null,
    error: null,
    finishedAt: null,
    lastError:
      progress.lastError ||
      "Recovered after the bulk publish worker stopped unexpectedly",
  });
}

export async function recoverOrphanedBulkPublishRuns(options = {}) {
  if (recoveryPromise) {
    return recoveryPromise;
  }

  recoveryPromise = (async () => {
    const normalizedRunId = String(options?.runId || "").trim();
    const normalizedCampaignSlug = String(options?.campaignSlug || "").trim();
    const limit = Math.max(
      1,
      Math.min(100, Number(options?.limit || 50) || 50)
    );
    const candidates = normalizedRunId
      ? [await loadProgress(normalizedRunId)]
      : await listProgressRuns({
          campaignSlug: normalizedCampaignSlug,
          statuses: ACTIVE_BULK_PUBLISH_STATUSES,
          limit,
        });
    const recovered = [];

    for (const progress of candidates) {
      const nextProgress = await recoverOrphanedProgress(progress);

      if (nextProgress?.runId) {
        recovered.push(nextProgress);
      }
    }

    return recovered;
  })().finally(() => {
    recoveryPromise = null;
  });

  return recoveryPromise;
}

function ensureBulkPublishWatchdogRunning() {
  if (watchdogTimer) {
    return;
  }

  watchdogTimer = setInterval(() => {
    void recoverOrphanedBulkPublishRuns()
      .then((recovered) => {
        if (Array.isArray(recovered) && recovered.length) {
          ensureBulkPublishQueueRunning();
        }
      })
      .catch((error) => {
        console.error("bulk publish watchdog recovery failed:", error);
      });
  }, BULK_PUBLISH_WATCHDOG_INTERVAL_MS);

  watchdogTimer.unref?.();
}

async function markCancelled(progress) {
  await saveProgress({
    ...progress,
    completed: false,
    status: "cancelled",
    cancelRequested: false,
    cancelRequestedAt: null,
    workerClaimedAt: null,
    error: null,
    finishedAt: new Date().toISOString(),
  });
}

async function runQueuedProgress(runId) {
  const progress = await loadProgress(runId);

  if (!progress?.runId) {
    return;
  }

  if (progress.status === "cancelled") {
    return;
  }

  if (progress.status === "cancelling" || progress.cancelRequested) {
    await markCancelled(progress);
    return;
  }

  try {
    await bulkPublishPipeline({
      runId: progress.runId,
      campaignSlug: progress.campaignSlug,
      caption: progress.caption,
      publishAt: progress.publishAt,
      publishMode: progress.publishMode,
      accountOrderMode: progress.accountOrderMode,
      accountOrderSeed: progress.accountOrderSeed,
      videoDir: progress.videoDir,
      urlWatcherEnabled: progress.urlWatcherEnabled,
      retryJobs: progress.retryJobs,
      retrySourceRunId: progress.retrySourceRunId,
    });
  } catch (error) {
    console.error("bulk publish queue error:", error);

    const latestProgress = await loadProgress(runId).catch(() => progress);

    if (
      !latestProgress?.runId ||
      ["completed", "failed", "cancelled"].includes(latestProgress.status)
    ) {
      return;
    }

    await saveProgress({
      ...latestProgress,
      completed: false,
      status: "failed",
      cancelRequested: false,
      cancelRequestedAt: null,
      workerClaimedAt: null,
      error: error.message || "Failed to process bulk publish run",
      finishedAt: new Date().toISOString(),
    });
  }
}

async function drainQueue() {
  do {
    queueWakeRequested = false;

    async function drainQueueWorker() {
      while (true) {
        const progress = await claimNextQueuedProgress();

        if (!progress?.runId) {
          return;
        }

        await runQueuedProgress(progress.runId);
      }
    }

    await Promise.all(
      Array.from(
        { length: BULK_PUBLISH_RUN_CONCURRENCY },
        () => drainQueueWorker()
      )
    );
  } while (queueWakeRequested);
}

export function ensureBulkPublishQueueRunning() {
  queueWakeRequested = true;
  ensureBulkPublishWatchdogRunning();

  if (!drainPromise) {
    drainPromise = recoverOrphanedBulkPublishRuns()
      .then(() => drainQueue())
      .catch((error) => {
        console.error("bulk publish queue failed:", error);
      })
      .finally(() => {
        const shouldRestart = queueWakeRequested;
        drainPromise = null;

        if (shouldRestart) {
          ensureBulkPublishQueueRunning();
        }
      });
  }

  return drainPromise;
}
