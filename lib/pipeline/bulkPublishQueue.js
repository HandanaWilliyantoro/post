import { bulkPublishPipeline } from "@/lib/pipeline/bulkPublish.pipeline";
import {
  claimNextQueuedProgress,
  loadProgress,
  saveProgress,
} from "@/lib/utils/progressManager";

let drainPromise = null;
let queueWakeRequested = false;

async function markCancelled(progress) {
  await saveProgress({
    ...progress,
    completed: false,
    status: "cancelled",
    cancelRequested: false,
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
      videoDir: progress.videoDir,
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
      error: error.message || "Failed to process bulk publish run",
      finishedAt: new Date().toISOString(),
    });
  }
}

async function drainQueue() {
  do {
    queueWakeRequested = false;

    while (true) {
      const progress = await claimNextQueuedProgress();

      if (!progress?.runId) {
        break;
      }

      await runQueuedProgress(progress.runId);
    }
  } while (queueWakeRequested);
}

export function ensureBulkPublishQueueRunning() {
  queueWakeRequested = true;

  if (!drainPromise) {
    drainPromise = drainQueue()
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
