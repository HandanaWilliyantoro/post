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

function parseEasternDate(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error("Invalid date input");
  }

  const datetime = DateTime.fromISO(normalized, {
    zone: EASTERN_TIMEZONE,
  });

  if (!datetime.isValid || normalized !== datetime.toFormat("yyyy-MM-dd")) {
    throw new Error("Invalid date input");
  }

  return datetime;
}

export function easternDateTimeInputToIso(value) {
  return parseEasternDateTime(value).toUTC().toISO({
    suppressMilliseconds: false,
  });
}

export function normalizeEasternDateInput(value) {
  try {
    return parseEasternDate(value).toFormat("yyyy-MM-dd");
  } catch {
    return "";
  }
}

export function easternDateInputToIsoRangeStart(value) {
  return parseEasternDate(value)
    .startOf("day")
    .toUTC()
    .toISO({ suppressMilliseconds: false });
}

export function easternDateInputToIsoRangeEnd(value) {
  return parseEasternDate(value)
    .endOf("day")
    .toUTC()
    .toISO({ suppressMilliseconds: false });
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

export function addHoursToEasternDateTimeInput(value, hours = 0) {
  return parseEasternDateTime(value)
    .plus({ hours: Number(hours || 0) })
    .toFormat("yyyy-MM-dd'T'HH:mm");
}

export function getDefaultBulkPublishDateTimeInput(
  latestPublishAt = null,
  hourOffset = 2
) {
  const latestEastern = latestPublishAt
    ? DateTime.fromISO(String(latestPublishAt), { zone: "utc" })
        .setZone(EASTERN_TIMEZONE)
        .startOf("minute")
    : null;
  const anchor = latestEastern?.isValid
    ? latestEastern
    : DateTime.now().setZone(EASTERN_TIMEZONE).startOf("minute");

  return anchor
    .plus({ hours: Number(hourOffset || 0) })
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
