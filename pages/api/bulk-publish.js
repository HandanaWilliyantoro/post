import { bulkPublishPipeline } from "@/lib/pipeline/bulkPublish.pipeline";
import { loadProgress, resetProgress } from "@/lib/utils/progressManager";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const progress = await loadProgress();
      return res.status(200).json({ success: true, data: progress });
    } catch (error) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to load progress" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const campaignSlug = String(req.body?.campaignSlug || "").trim();
    const videoDir = String(req.body?.videoDir || "").trim();
    const startDate = String(req.body?.startDate || "").trim();

    if (!campaignSlug) {
      return res.status(400).json({ success: false, error: "campaignSlug is required" });
    }

    if (!videoDir) {
      return res.status(400).json({ success: false, error: "videoDir is required" });
    }

    if (!startDate || Number.isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({ success: false, error: "Valid startDate is required" });
    }

    const activeProgress = await loadProgress();

    if (activeProgress.status === "running") {
      return res.status(409).json({
        success: false,
        error: "A bulk publish job is already running",
        data: activeProgress,
      });
    }

    await resetProgress({
      campaignSlug,
      startDate,
      videoDir,
      status: "queued",
      completed: false,
      percentage: 0,
    });

    setTimeout(() => {
      bulkPublishPipeline({
        campaignSlug,
        videoDir,
        startDate,
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
