export const ACTIVE_ACCOUNT_STATUS = "active";

export function normalizeAccountStatus(
  value,
  fallback = ACTIVE_ACCOUNT_STATUS
) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || fallback;
}

export function resolveAssignmentStatus(campaignSlug) {
  if (Array.isArray(campaignSlug)) {
    return campaignSlug.some((slug) => String(slug || "").trim())
      ? "assigned"
      : "idle";
  }

  return String(campaignSlug || "").trim() ? "assigned" : "idle";
}
