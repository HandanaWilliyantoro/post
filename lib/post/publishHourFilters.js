export const POST_PUBLISH_HOUR_FILTER_OPTIONS = [
  { value: "", label: "All hours" },
  { value: "7", label: "7:00 AM ET" },
  { value: "15", label: "3:00 PM ET" },
  { value: "23", label: "11:00 PM ET" },
];

const ALLOWED_HOURS = new Set([7, 15, 23]);

export function normalizePublishHourFilter(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const hour = Number(value);

  if (!Number.isInteger(hour) || !ALLOWED_HOURS.has(hour)) {
    return null;
  }

  return hour;
}
