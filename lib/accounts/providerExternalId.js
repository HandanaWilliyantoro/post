import { randomUUID } from "crypto";

const CAMPAIGN_CONNECTION_PREFIX = "post-dashboard:campaign:";

function normalizeSlug(value) {
  return String(value || "").trim().replace(/:+/g, "-");
}

export function buildCampaignConnectionExternalId(campaignSlug) {
  const slug = normalizeSlug(campaignSlug);

  if (!slug) {
    throw new Error("campaignSlug is required");
  }

  return `${CAMPAIGN_CONNECTION_PREFIX}${slug}:${randomUUID()}`;
}

export function parseCampaignSlugFromExternalId(value) {
  const externalId = String(value || "").trim();

  if (!externalId.startsWith(CAMPAIGN_CONNECTION_PREFIX)) {
    return "";
  }

  const remainder = externalId.slice(CAMPAIGN_CONNECTION_PREFIX.length);
  return normalizeSlug(remainder.split(":")[0]);
}
