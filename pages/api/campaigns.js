import { createCampaign, deleteCampaign, getCampaignRoutes } from "@/lib/campaigns";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const campaigns = await getCampaignRoutes();
      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.status(200).json({ success: true, data: campaigns });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error?.message || "Failed to fetch campaigns",
      });
    }
  }

  if (req.method === "POST") {
    try {
      const campaign = await createCampaign(req.body || {});
      return res.status(201).json({ success: true, data: campaign });
    } catch (error) {
      const message = error?.message || "Failed to create campaign";
      const statusCode =
        message.includes("required") ||
        message.includes("invalid") ||
        message.includes("already exists")
          ? 400
          : 500;

      return res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }

  if (req.method === "DELETE") {
    try {
      const slug = String(req.query?.slug || req.body?.slug || "").trim();
      const result = await deleteCampaign(slug);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error?.message || "Failed to delete campaign";
      const statusCode =
        message.includes("required") ||
        message.includes("cannot be deleted") ||
        message.includes("not found")
          ? 400
          : 500;

      return res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }

  return res.status(405).json({ success: false, error: "Method not allowed" });
}
