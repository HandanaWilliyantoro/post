export const DEFAULT_ACCOUNT_PLATFORM = "instagram";

const SEEDED_ACCOUNT_PLATFORMS = new Set(["instagram", "tiktok"]);

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

  if (platform === "tiktok") {
    return "TikTok";
  }

  return platform.charAt(0).toUpperCase() + platform.slice(1);
}
