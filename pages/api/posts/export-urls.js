import { findCampaignBySlug } from "@/lib/campaigns";
import { buildPublishedUrlExport } from "@/lib/post/exportPublishedUrls";

export const config = {
  maxDuration: 300,
};

function safeFilenamePart(value) {
  return String(value || "campaign")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "campaign";
}

function parseWindowHours(value) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function parseBooleanQuery(value) {
  const normalized = String(Array.isArray(value) ? value[0] : value || "")
    .trim()
    .toLowerCase();

  return ["1", "true", "yes", "on"].includes(normalized);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const campaignSlug = String(req.query?.campaignSlug || "").trim();
  const requestedWindowHours = parseWindowHours(req.query?.hours);
  const includeRemoteDetails = parseBooleanQuery(req.query?.includeDetails);

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
      includeRemoteDetails,
      windowHours: requestedWindowHours,
    });
    const exportedWindowHours = exported.windowHours;

    if (!exported.urlCount) {
      return res.status(404).json({
        success: false,
        error: exportedWindowHours
          ? `No published URLs were found in the last ${exportedWindowHours} hours`
          : "No published URLs were found for this campaign",
      });
    }

    const filenameSuffix = exportedWindowHours
      ? `last-${exportedWindowHours}h`
      : "all";
    const filename = `${safeFilenamePart(
      campaign.slug
    )}-published-post-urls-${filenameSuffix}.csv`;

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Export-Post-Count", String(exported.postCount));
    res.setHeader("X-Export-Url-Count", String(exported.urlCount));
    res.setHeader("X-Export-Username-Count", String(exported.usernameCount));
    res.setHeader("X-Export-Window-Hours", String(exported.windowHours || ""));

    return res.status(200).send(exported.content);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to export published URLs",
    });
  }
}
