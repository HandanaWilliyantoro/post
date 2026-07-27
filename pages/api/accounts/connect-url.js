import { syncAccountsFromProvider } from "@/lib/accounts/accountSync";
import { buildCampaignConnectionExternalId } from "@/lib/accounts/providerExternalId";
import {
  isSupportedSeedAccountPlatform,
  normalizeAccountPlatform,
} from "@/lib/accounts/platforms";
import { clearAccountsCache } from "@/lib/accounts/getAccounts";
import { findCampaignBySlug } from "@/lib/campaigns";
import { createSocialAccountAuthUrl } from "@/lib/postforme/accounts";

function getHeaderValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getRequestOrigin(req) {
  const host = getHeaderValue(
    req.headers["x-forwarded-host"] || req.headers.host
  );

  if (!host) {
    return "";
  }

  const proto =
    getHeaderValue(req.headers["x-forwarded-proto"]) ||
    (req.socket?.encrypted ? "https" : "http");

  return `${proto}://${host}`;
}

function buildRedirectUrl(req, campaignSlug) {
  const origin = getRequestOrigin(req);

  if (!origin) {
    return "";
  }

  const redirectUrl = new URL(
    `/campaign-details/${encodeURIComponent(campaignSlug)}`,
    origin
  );
  redirectUrl.searchParams.set("metric", "totalAccounts");
  redirectUrl.searchParams.set("connected", "1");

  return redirectUrl.toString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const campaignSlug = String(req.body?.campaignSlug || "").trim();
    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      return res.status(400).json({
        success: false,
        error: "Campaign not found",
      });
    }

    const platform = normalizeAccountPlatform(req.body?.platform, "");

    if (!isSupportedSeedAccountPlatform(platform)) {
      return res.status(400).json({
        success: false,
        error: "Platform is not supported",
      });
    }

    const authUrl = await createSocialAccountAuthUrl({
      platform,
      external_id: buildCampaignConnectionExternalId(campaign.slug),
      redirect_url_override: buildRedirectUrl(req, campaign.slug),
      permissions: Array.isArray(req.body?.permissions)
        ? req.body.permissions
        : ["posts"],
    });

    clearAccountsCache();

    return res.status(200).json({
      success: true,
      data: authUrl,
    });
  } catch (error) {
    const message = error?.message || "Failed to create account connection URL";
    const statusCode =
      message.includes("POSTFORME_API_KEY") ||
      message.includes("Platform") ||
      message.includes("Campaign")
        ? 400
        : 500;

    console.error("Failed to create PostForMe auth URL:", error);
    return res.status(statusCode).json({ success: false, error: message });
  }
}
