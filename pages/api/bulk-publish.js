import { bulkPublishPipeline } from "@/lib/pipeline/bulkPublish.pipeline";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { videoDir } = req.body;

    if (!videoDir) {
      return res.status(400).json({
        error: "videoDir is required",
      });
    }

    // 🔥 DO NOT await (important)
    bulkPublishPipeline({ videoDir })
      .then(() => {
        console.log("✅ Bulk job finished");
      })
      .catch((err) => {
        console.error("❌ Bulk job failed:", err);
      });

    return res.status(200).json({
      success: true,
      message: "Bulk publishing started 🚀",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to start bulk publish",
    });
  }
}