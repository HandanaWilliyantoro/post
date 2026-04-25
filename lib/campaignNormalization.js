export const DEFAULT_TREND = [0, 0, 0, 0, 0, 0];
export const CAMPAIGN_TYPES = ["auto-scan", "manual"];

export function toCampaignHref(slug) {
  return `/campaigns/${slug}`;
}

export function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeCampaignType(value) {
  const normalized = normalizeText(value).toLowerCase();
  return CAMPAIGN_TYPES.includes(normalized) ? normalized : "manual";
}

export function slugifyCampaign(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeMetrics(metrics = {}) {
  return {
    totalPosts: {
      value: Number(metrics?.totalPosts?.value || 0),
      trend: Array.isArray(metrics?.totalPosts?.trend)
        ? metrics.totalPosts.trend
        : DEFAULT_TREND,
    },
    totalAccounts: {
      value: Number(metrics?.totalAccounts?.value || 0),
      trend: Array.isArray(metrics?.totalAccounts?.trend)
        ? metrics.totalAccounts.trend
        : DEFAULT_TREND,
    },
  };
}

export function normalizeCampaignDocument(campaign) {
  const slug = normalizeText(campaign?.slug);
  const campaignType = normalizeCampaignType(campaign?.campaignType);

  return {
    slug,
    isDefault: Boolean(campaign?.isDefault),
    niche: normalizeText(campaign?.niche) || "streaming",
    label: normalizeText(campaign?.label),
    description: normalizeText(campaign?.description),
    href: toCampaignHref(slug),
    icon: normalizeText(campaign?.icon) || "spark",
    campaignType,
    campaignId: normalizeText(campaign?.campaignId),
    campaignPassword: normalizeText(campaign?.campaignPassword),
    metrics: normalizeMetrics(campaign?.metrics),
    created_at: campaign?.created_at || new Date().toISOString(),
  };
}
