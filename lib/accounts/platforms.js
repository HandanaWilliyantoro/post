export const DEFAULT_ACCOUNT_PLATFORM = "instagram";

const SEEDED_ACCOUNT_PLATFORMS = new Set([
  "bluesky",
  "facebook",
  "instagram",
  "linkedin",
  "pinterest",
  "threads",
  "tiktok",
  "tiktok_business",
  "x",
  "youtube",
]);

const PLATFORM_LABELS = new Map([
  ["bluesky", "Bluesky"],
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["linkedin", "LinkedIn"],
  ["pinterest", "Pinterest"],
  ["threads", "Threads"],
  ["tiktok", "TikTok"],
  ["tiktok_business", "TikTok Business"],
  ["x", "X"],
  ["youtube", "YouTube"],
]);

export function normalizeAccountPlatform(
  value,
  fallback = DEFAULT_ACCOUNT_PLATFORM
) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || fallback;
}

export function isSupportedSeedAccountPlatform(value) {
  return SEEDED_ACCOUNT_PLATFORMS.has(normalizeAccountPlatform(value, ""));
}

export function formatAccountPlatformLabel(value) {
  const platform = normalizeAccountPlatform(value);

  if (PLATFORM_LABELS.has(platform)) return PLATFORM_LABELS.get(platform);

  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export const ACCOUNT_PLATFORM_OPTIONS = Array.from(
  SEEDED_ACCOUNT_PLATFORMS,
  (value) => ({
    value,
    label: formatAccountPlatformLabel(value),
  })
);
