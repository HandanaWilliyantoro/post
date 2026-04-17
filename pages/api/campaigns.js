import { createCampaign, getCampaignRoutes } from "@/lib/campaigns";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const campaigns = await getCampaignRoutes();
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

  return res.status(405).json({ success: false, error: "Method not allowed" });
}
