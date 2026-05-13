export const POST_STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "queued", label: "Queued" },
  { value: "pending", label: "Pending" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "running", label: "Running" },
  { value: "partial", label: "Partial" },
  { value: "published", label: "Published" },
  { value: "completed", label: "Completed" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

export function normalizePostStatusFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return POST_STATUS_FILTER_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : "";
}
