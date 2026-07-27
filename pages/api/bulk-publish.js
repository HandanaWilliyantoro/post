import {
  cancelBulkPublishRun,
  hasActiveBulkPublishRun,
} from "@/lib/pipeline/bulkPublishRunRegistry";
import {
  ensureBulkPublishQueueRunning,
  recoverOrphanedBulkPublishRuns,
} from "@/lib/pipeline/bulkPublishQueue";
import {
  buildRetryJobsFromFailedPosts,
  resolveRetryableFailedJobs,
  validateBulkPublishSetup,
} from "@/lib/pipeline/bulkPublish.pipeline";
import { normalizeBulkPublishMode } from "@/lib/pipeline/bulkPublishModes";
import { resolveAccountOrderModeForCampaign } from "@/lib/pipeline/accountOrder";
import { listFailedPosts } from "@/lib/post";
import { buildPostDuplicateKey } from "@/lib/post/duplicateGuard";
import {
  createProgress,
  loadLatestProgress,
  loadProgress,
  listProgressRuns,
  saveProgress,
} from "@/lib/utils/progressManager";
import {
  easternDateTimeInputToIso,
  normalizeBulkPublishDateTimeInput,
} from "@/lib/utils/easternTime";

const ACTIVE_BULK_PUBLISH_STATUSES = ["queued", "running", "cancelling"];
const TERMINAL_BULK_PUBLISH_STATUSES = ["completed", "failed", "cancelled"];
const RECENT_RUNS_LIMIT = 25;
const RETRY_ALL_RUNS_LIMIT = 100;

function parseLimit(value, fallback = 6) {
  return Math.max(
    1,
    Math.min(100, Number.parseInt(String(value || fallback), 10) || fallback)
  );
}

function dedupeRetryJobs(campaignSlug, retryJobs) {
  const seen = new Set();

  return retryJobs.filter((job) => {
    const content = String(job?.caption || "").trim();
    const publishAt = String(job?.publishAt || "").trim();
    const targets = Array.isArray(job?.targets) && job.targets.length
      ? job.targets
      : job?.accountId
        ? [{ account_id: job.accountId }]
        : [];

    if (!content || !publishAt || !targets.length) {
      return false;
    }

    const key = buildPostDuplicateKey({
      campaignSlug,
      content,
      publish_at: publishAt,
      targets,
    });

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function disableRetryJobUrlWatcher(retryJobs) {
  return Array.isArray(retryJobs)
    ? retryJobs.map((job) => ({ ...job, urlWatcherEnabled: false }))
    : [];
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const runId = String(req.query?.runId || "").trim();
      const campaignSlug = String(req.query?.campaignSlug || "").trim();
      const limit = parseLimit(req.query?.limit, RECENT_RUNS_LIMIT);
      await recoverOrphanedBulkPublishRuns(
        runId ? { runId } : { campaignSlug, limit }
      );
      ensureBulkPublishQueueRunning();

      if (runId) {
        const progress = await loadProgress(runId);

        if (!progress?.runId) {
          return res
            .status(404)
            .json({ success: false, error: "Bulk publish run not found" });
        }

        if (
          progress.status === "cancelling" &&
          !hasActiveBulkPublishRun(progress.runId)
        ) {
          const normalizedProgress = await saveProgress({
            ...progress,
            status: "cancelled",
            cancelRequested: false,
            error: null,
            finishedAt: progress.finishedAt || new Date().toISOString(),
          });

          return res
            .status(200)
            .json({ success: true, data: normalizedProgress, runs: [normalizedProgress] });
        }

        return res
          .status(200)
          .json({ success: true, data: progress, runs: [progress] });
      }

      const [latestProgress, runs] = await Promise.all([
        loadLatestProgress({ campaignSlug }),
        listProgressRuns({ campaignSlug, limit }),
      ]);

      return res.status(200).json({
        success: true,
        data: latestProgress,
        runs,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to load progress" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const body = req.body || {};
      const runId = String(body?.runId || req.query?.runId || "").trim();
      const campaignSlug = String(
        body?.campaignSlug || req.query?.campaignSlug || ""
      ).trim();
      const activeProgress = runId
        ? await loadProgress(runId)
        : await loadLatestProgress({
            campaignSlug,
            statuses: ACTIVE_BULK_PUBLISH_STATUSES,
          });

      if (!activeProgress?.runId) {
        return res.status(404).json({
          success: false,
          error: "Bulk publish run not found",
        });
      }

      if (!ACTIVE_BULK_PUBLISH_STATUSES.includes(activeProgress.status)) {
        return res.status(409).json({
          success: false,
          error: "No active bulk publish job to cancel",
          data: activeProgress,
        });
      }

      if (
        campaignSlug &&
        activeProgress.campaignSlug &&
        activeProgress.campaignSlug !== campaignSlug
      ) {
        return res.status(409).json({
          success: false,
          error: "The active bulk publish job belongs to a different campaign",
          data: activeProgress,
        });
      }

      const isQueuedAndUnclaimed =
        activeProgress.status === "queued" && !activeProgress.workerClaimedAt;
      const nextProgress = await saveProgress({
        ...activeProgress,
        completed: false,
        status: isQueuedAndUnclaimed ? "cancelled" : "cancelling",
        cancelRequested: !isQueuedAndUnclaimed,
        cancelRequestedAt: new Date().toISOString(),
        error: null,
        finishedAt: isQueuedAndUnclaimed
          ? new Date().toISOString()
          : activeProgress.finishedAt || null,
      });

      if (!isQueuedAndUnclaimed) {
        cancelBulkPublishRun(activeProgress.runId);
      }

      return res.status(200).json({
        success: true,
        message: isQueuedAndUnclaimed
          ? "Bulk publish queue item cancelled"
          : "Bulk publish cancellation requested",
        data: nextProgress,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: "Failed to cancel bulk publish",
      });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const action = String(req.body?.action || "").trim();
    const campaignSlug = String(req.body?.campaignSlug || "").trim();
    const caption = String(req.body?.caption || "").trim();
    const publishAtInput = String(req.body?.publishAt || "").trim();
    const publishMode = normalizeBulkPublishMode(req.body?.publishMode);
    const accountOrderMode = resolveAccountOrderModeForCampaign(
      campaignSlug,
      req.body?.accountOrderMode
    );
    const accountOrderSeed = null;
    const videoDir = String(req.body?.videoDir || "").trim();

    if (action === "retry-failed") {
      const sourceRunId = String(req.body?.runId || "").trim();

      if (!sourceRunId) {
        return res
          .status(400)
          .json({ success: false, error: "runId is required" });
      }

      const sourceProgress = await loadProgress(sourceRunId);

      if (!sourceProgress?.runId) {
        return res
          .status(404)
          .json({ success: false, error: "Bulk publish run not found" });
      }

      if (
        campaignSlug &&
        sourceProgress.campaignSlug &&
        sourceProgress.campaignSlug !== campaignSlug
      ) {
        return res.status(409).json({
          success: false,
          error: "The selected bulk publish run belongs to a different campaign",
          data: sourceProgress,
        });
      }

      if (!TERMINAL_BULK_PUBLISH_STATUSES.includes(sourceProgress.status)) {
        return res.status(409).json({
          success: false,
          error: "Failed posts can only be recreated after the run finishes",
          data: sourceProgress,
        });
      }

      let retryableFailedJobs = [];

      try {
        retryableFailedJobs = disableRetryJobUrlWatcher(
          await resolveRetryableFailedJobs(sourceProgress)
        );
      } catch (error) {
        return res.status(409).json({
          success: false,
          error:
            error?.message ||
            "Failed to rebuild retryable failed posts from the original run",
          data: sourceProgress,
        });
      }

      if (!retryableFailedJobs.length) {
        return res.status(409).json({
          success: false,
          error:
            "This bulk publish run has no retryable failed posts. Check that the original folder path and account mapping still exist.",
          data: sourceProgress,
        });
      }

      const progress = await createProgress({
        campaignSlug: sourceProgress.campaignSlug,
        caption: sourceProgress.caption,
        publishAt: sourceProgress.publishAt,
        publishMode: sourceProgress.publishMode,
        accountOrderMode: resolveAccountOrderModeForCampaign(
          sourceProgress.campaignSlug,
          sourceProgress.accountOrderMode || accountOrderMode
        ),
        accountOrderSeed: sourceProgress.accountOrderSeed || accountOrderSeed,
        urlWatcherEnabled: false,
        videoDir: sourceProgress.videoDir,
        status: "queued",
        completed: false,
        percentage: 0,
        cancelRequested: false,
        cancelRequestedAt: null,
        finishedAt: null,
        retryJobs: retryableFailedJobs,
        retrySourceRunId: sourceProgress.runId,
      });

      ensureBulkPublishQueueRunning();

      return res.status(202).json({
        success: true,
        message: "Failed bulk publish posts queued for retry",
        data: progress,
      });
    }

    if (action === "retry-all-failed") {
      if (!campaignSlug) {
        return res
          .status(400)
          .json({ success: false, error: "campaignSlug is required" });
      }

      const failedPosts = await listFailedPosts({ campaignSlug });

      if (!failedPosts.length) {
        return res.status(409).json({
          success: false,
          error: "There are no failed posts to retry",
        });
      }

      const retryJobs = disableRetryJobUrlWatcher(
        dedupeRetryJobs(campaignSlug, buildRetryJobsFromFailedPosts(failedPosts))
      );

      if (!retryJobs.length) {
        return res.status(409).json({
          success: false,
          error:
            "No retryable failed posts were found. Check that the original source files and account mappings still exist.",
        });
      }

      const firstRetryJobCaption =
        String(retryJobs[0]?.caption || "").trim() || "Retry failed posts";
      const firstRetryJobPublishAt =
        String(retryJobs[0]?.publishAt || "").trim() || new Date().toISOString();
      const progress = await createProgress({
        campaignSlug,
        caption: firstRetryJobCaption,
        publishAt: firstRetryJobPublishAt,
        publishMode: "same-time",
        accountOrderMode,
        accountOrderSeed,
        urlWatcherEnabled: false,
        videoDir: failedPosts
          .map((post) => String(post?.source_file_path || "").trim())
          .filter(Boolean)
          .join(" | "),
        status: "queued",
        completed: false,
        percentage: 0,
        cancelRequested: false,
        cancelRequestedAt: null,
        finishedAt: null,
        retryJobs,
        retrySourceRunId: failedPosts
          .map((post) => String(post?.failure?.runId || "").trim())
          .filter(Boolean)
          .join(","),
      });

      ensureBulkPublishQueueRunning();

      return res.status(202).json({
        success: true,
        message: `Queued ${retryJobs.length} failed posts for retry`,
        data: progress,
      });
    }

    if (!campaignSlug) {
      return res
        .status(400)
        .json({ success: false, error: "campaignSlug is required" });
    }

    if (!caption) {
      return res
        .status(400)
        .json({ success: false, error: "caption is required" });
    }

    let publishAtIso = "";

    try {
      publishAtIso = easternDateTimeInputToIso(
        normalizeBulkPublishDateTimeInput(publishAtInput)
      );
    } catch {
      return res
        .status(400)
        .json({ success: false, error: "Valid publishAt is required" });
    }

    if (!videoDir) {
      return res
        .status(400)
        .json({ success: false, error: "videoDir is required" });
    }

    if (new Date(publishAtIso).getTime() < Date.now() - 60 * 1000) {
      return res.status(400).json({
        success: false,
        error: "Publish time must be current or future Eastern time",
      });
    }

    try {
      await validateBulkPublishSetup({
        campaignSlug,
        caption,
        videoDir,
        publishMode,
        publishAt: publishAtIso,
        accountOrderMode,
        accountOrderSeed,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error?.message || "Bulk publish validation failed",
      });
    }

    const progress = await createProgress({
      campaignSlug,
      caption,
      publishAt: publishAtIso,
      publishMode,
      accountOrderMode,
      accountOrderSeed,
      urlWatcherEnabled: false,
      videoDir,
      status: "queued",
      completed: false,
      percentage: 0,
      cancelRequested: false,
      cancelRequestedAt: null,
      finishedAt: null,
    });

    ensureBulkPublishQueueRunning();

    return res.status(202).json({
      success: true,
      message: "Bulk publish queued",
      data: progress,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to start bulk publish",
    });
  }
}
