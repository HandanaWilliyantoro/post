import { isoToEasternDateTimeInput } from "@/lib/utils/easternTime";

export function normalizeMetric(metric) {
  return ["totalAccounts", "queuedPosts", "totalPosts"].includes(metric) ? metric : "totalPosts";
}

export function isQueuedLike(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "queued" || normalized === "scheduled";
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function toDateTimeInputValue(value) {
  return isoToEasternDateTimeInput(value);
}

export function shorten(text, max = 72) {
  const value = String(text || "").trim();
  if (!value) return "—";
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function getPostPreviewSrc(post) {
  return post?.media?.[0]?.url || "";
}

export function summarizeTargets(targets) {
  if (!Array.isArray(targets) || !targets.length) return "No targets";
  return targets.map((target) => [String(target?.username || "").trim() || target?.account_id || "unknown", String(target?.platform || "").trim(), String(target?.status || "").trim()].filter(Boolean).join(" • ")).join(", ");
}
