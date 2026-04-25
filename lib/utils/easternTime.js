import { DateTime } from "luxon";

export const EASTERN_TIMEZONE = "America/New_York";
export const EASTERN_LABEL = "ET";

function parseEasternDateTime(value) {
  const datetime = DateTime.fromISO(String(value || "").trim(), {
    zone: EASTERN_TIMEZONE,
  });

  if (!datetime.isValid) {
    throw new Error("Invalid datetime input");
  }

  return datetime;
}

export function easternDateTimeInputToIso(value) {
  return parseEasternDateTime(value).toUTC().toISO({
    suppressMilliseconds: false,
  });
}

export function isoToEasternDateTimeInput(value) {
  if (!value) {
    return "";
  }

  const datetime = DateTime.fromISO(String(value), { zone: "utc" }).setZone(
    EASTERN_TIMEZONE
  );

  return datetime.isValid ? datetime.toFormat("yyyy-MM-dd'T'HH:mm") : "";
}

export function getEasternDateTimeInputAfterMinutes(minutes = 60) {
  return DateTime.now()
    .setZone(EASTERN_TIMEZONE)
    .plus({ minutes: Number(minutes || 0) })
    .toFormat("yyyy-MM-dd'T'HH:mm");
}

export function getCurrentEasternDateTimeInput() {
  return DateTime.now()
    .setZone(EASTERN_TIMEZONE)
    .toFormat("yyyy-MM-dd'T'HH:mm");
}

export function formatEasternDateTime(value) {
  if (!value) return "-";

  const datetime = DateTime.fromISO(String(value), { zone: "utc" }).setZone(
    EASTERN_TIMEZONE
  );

  if (!datetime.isValid) {
    return "-";
  }

  return `${datetime.toFormat("MMM dd, yyyy, hh:mm a")} ${datetime.offsetNameShort || EASTERN_LABEL}`;
}

export function getEasternNowParts() {
  const datetime = DateTime.now().setZone(EASTERN_TIMEZONE);

  return {
    year: datetime.year,
    month: datetime.month,
    day: datetime.day,
    hour: datetime.hour,
    minute: datetime.minute,
    second: datetime.second,
  };
}

export function getCurrentEasternTimestampMs() {
  return DateTime.now().setZone(EASTERN_TIMEZONE).toMillis();
}
