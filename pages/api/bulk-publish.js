import { bulkPublishPipeline } from "@/lib/pipeline/bulkPublish.pipeline";
import {
  cancelBulkPublishRun,
  hasActiveBulkPublishRun,
} from "@/lib/pipeline/bulkPublishRunRegistry";
import {
  loadProgress,
  resetProgress,
  saveProgress,
} from "@/lib/utils/progressManager";
import { easternDateTimeInputToIso } from "@/lib/utils/easternTime";

const ACTIVE_BULK_PUBLISH_STATUSES = ["queued", "running", "cancelling"];

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const progress = await loadProgress();

      if (
        progress.status === "cancelling" &&
        !hasActiveBulkPublishRun(progress.campaignSlug)
      ) {
        const normalizedProgress = {
          ...progress,
          status: "cancelled",
          cancelRequested: false,
          cancelRequestedAt: null,
          error: null,
        };

        await saveProgress(normalizedProgress);
        return res.status(200).json({ success: true, data: normalizedProgress });
      }

      return res.status(200).json({ success: true, data: progress });
    } catch (error) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to load progress" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const campaignSlug = String(
        req.body?.campaignSlug || req.query?.campaignSlug || ""
      ).trim();
      const activeProgress = await loadProgress();

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

      const nextProgress = {
        ...activeProgress,
        completed: false,
        status: "cancelling",
        cancelRequested: true,
        cancelRequestedAt: new Date().toISOString(),
        error: null,
      };

      await saveProgress(nextProgress);
      cancelBulkPublishRun(activeProgress.campaignSlug || campaignSlug);

      return res.status(200).json({
        success: true,
        message: "Bulk publish cancellation requested",
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
    const campaignSlug = String(req.body?.campaignSlug || "").trim();
    const caption = String(req.body?.caption || "").trim();
    const publishAtInput = String(req.body?.publishAt || "").trim();
    const publishMode = String(req.body?.publishMode || "same-time").trim();
    const videoDir = String(req.body?.videoDir || "").trim();

    if (!campaignSlug) {
      return res.status(400).json({ success: false, error: "campaignSlug is required" });
    }

    if (!caption) {
      return res.status(400).json({ success: false, error: "caption is required" });
    }

    let publishAtIso = "";

    try {
      publishAtIso = easternDateTimeInputToIso(publishAtInput);
    } catch {
      return res.status(400).json({ success: false, error: "Valid publishAt is required" });
    }

    if (!["same-time", "stagger-2h"].includes(publishMode)) {
      return res.status(400).json({ success: false, error: "Valid publish type is required" });
    }

    if (!videoDir) {
      return res.status(400).json({ success: false, error: "videoDir is required" });
    }

    const activeProgress = await loadProgress();

    if (ACTIVE_BULK_PUBLISH_STATUSES.includes(activeProgress.status)) {
      return res.status(409).json({
        success: false,
        error: "A bulk publish job is already active",
        data: activeProgress,
      });
    }

    await resetProgress({
      campaignSlug,
      caption,
      publishAt: publishAtIso,
      publishMode,
      videoDir,
      status: "queued",
      completed: false,
      percentage: 0,
      cancelRequested: false,
      cancelRequestedAt: null,
    });

    setTimeout(() => {
      bulkPublishPipeline({
        campaignSlug,
        caption,
        publishAt: publishAtIso,
        publishMode,
        videoDir,
      }).catch((error) => {
        console.error("bulk publish failed:", error);
      });
    }, 0);

    return res.status(200).json({
      success: true,
      message: "Bulk publishing started",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to start bulk publish",
    });
  }
}
