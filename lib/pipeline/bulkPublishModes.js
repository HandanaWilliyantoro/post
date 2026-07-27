export const PUBLISH_MODE_SAME_TIME = "same-time";
export const PUBLISH_MODE_WAVE_SCHEDULE = "wave-schedule";

const BULK_PUBLISH_MODES = new Set([
  PUBLISH_MODE_SAME_TIME,
  PUBLISH_MODE_WAVE_SCHEDULE,
]);

export function normalizeBulkPublishMode(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return BULK_PUBLISH_MODES.has(normalized)
    ? normalized
    : PUBLISH_MODE_SAME_TIME;
}
