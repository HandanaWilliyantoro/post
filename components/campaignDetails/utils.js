import {
  formatEasternDateTime,
  isoToEasternDateTimeInput,
} from "@/lib/utils/easternTime";

export function normalizeMetric(metric) {
  return ["totalAccounts", "totalPosts"].includes(metric)
    ? metric
    : "totalPosts";
}

export function formatDate(value) {
  return formatEasternDateTime(value);
}

export function toDateTimeInputValue(value) {
  return isoToEasternDateTimeInput(value);
}

export function shorten(text, max = 72) {
  const value = String(text || "").trim();
  if (!value) return "-";
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

export function getPostPreviewSrc(post) {
  return post?.media?.[0]?.url || "";
}

export function summarizeTargets(targets) {
  if (!Array.isArray(targets) || !targets.length) return "No targets";
  return targets
    .map((target) =>
      String(target?.username || "").trim() || target?.account_id || "unknown"
    )
    .join(", ");
}
