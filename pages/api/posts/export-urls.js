import { findCampaignBySlug } from "@/lib/campaigns";
import { buildPublishedUrlExport } from "@/lib/post/exportPublishedUrls";

export const config = {
  maxDuration: 300,
};

function safeFilenamePart(value) {
  return (
    String(value || "campaign")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "campaign"
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const campaignSlug = String(req.query?.campaignSlug || "").trim();

  if (!campaignSlug) {
    return res
      .status(400)
      .json({ success: false, error: "campaignSlug is required" });
  }

  try {
    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    const exported = await buildPublishedUrlExport({
      campaignSlug: campaign.slug,
    });

    if (!exported.urlCount) {
      return res.status(404).json({
        success: false,
        error: `No feed post URLs found for today (${exported.today}) or yesterday (${exported.yesterday}) on assigned accounts.`,
      });
    }

    const filename = `${safeFilenamePart(
      campaign.slug
    )}-post-urls-${exported.yesterday}_to_${exported.today}.csv`;

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Export-Url-Count", String(exported.urlCount));
    res.setHeader("X-Export-Username-Count", String(exported.usernameCount));
    res.setHeader("X-Export-Account-Count", String(exported.accountCount));
    res.setHeader("X-Export-Today", String(exported.today || ""));
    res.setHeader("X-Export-Yesterday", String(exported.yesterday || ""));

    return res.status(200).send(exported.content);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to export published URLs",
    });
  }
}
