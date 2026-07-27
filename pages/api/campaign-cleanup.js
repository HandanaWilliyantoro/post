import { findCampaignBySlug } from "@/lib/campaigns";
import { cleanupCampaignPosts } from "@/lib/post";
import { deleteFinishedProgressRuns } from "@/lib/utils/progressManager";

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const campaignSlug = String(
      req.query?.campaignSlug || req.body?.campaignSlug || ""
    ).trim();

    if (!campaignSlug) {
      return res.status(400).json({
        success: false,
        error: "Campaign slug is required",
      });
    }

    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    const [postsResult, runsResult] = await Promise.all([
      cleanupCampaignPosts(campaign.slug),
      deleteFinishedProgressRuns({ campaignSlug: campaign.slug }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...postsResult,
        ...runsResult,
      },
    });
  } catch (error) {
    const message = error?.message || "Failed to clean up campaign data";
    const statusCode = message.toLowerCase().includes("required") ? 400 : 500;

    return res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
}
