import { DateTime } from "luxon";

export const EASTERN_TIMEZONE = "America/New_York";
export const EASTERN_LABEL = "ET";
export const BULK_PUBLISH_DEFAULT_HOUR_OFFSET = 2;
export const BULK_PUBLISH_DEFAULT_START_HOUR = 7;
export const BULK_PUBLISH_DEFAULT_START_MINUTE = 0;

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

  const datetime = (
    value instanceof Date
      ? DateTime.fromJSDate(value, { zone: "utc" })
      : DateTime.fromISO(String(value), { zone: "utc" })
  ).setZone(EASTERN_TIMEZONE);

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

export function addMinutesToEasternDateTimeInput(value, minutes = 0) {
  return parseEasternDateTime(value)
    .plus({ minutes: Number(minutes || 0) })
    .toFormat("yyyy-MM-dd'T'HH:mm");
}

export function normalizeBulkPublishDateTimeInput(value) {
  return parseEasternDateTime(value)
    .set({
      second: 0,
      millisecond: 0,
    })
    .toFormat("yyyy-MM-dd'T'HH:mm");
}

export function getNextBulkPublishDateTimeInput(
  value,
  hours = BULK_PUBLISH_DEFAULT_HOUR_OFFSET
) {
  return normalizeBulkPublishDateTimeInput(
    addHoursToEasternDateTimeInput(value, hours)
  );
}

export function getDefaultBulkPublishDateTimeInput(
  latestPublishAt = null,
  hourOffset = BULK_PUBLISH_DEFAULT_HOUR_OFFSET
) {
  const now = DateTime.now().setZone(EASTERN_TIMEZONE).startOf("minute");
  const normalizedHourOffset = Number(hourOffset || 0);
  const scheduleStart = DateTime.fromISO("2026-08-01", {
    zone: EASTERN_TIMEZONE,
  }).set({
    hour: BULK_PUBLISH_DEFAULT_START_HOUR,
    minute: BULK_PUBLISH_DEFAULT_START_MINUTE,
    second: 0,
    millisecond: 0,
  });
  const firstDailyStart = now
    .plus({ days: 1 })
    .set({
      hour: BULK_PUBLISH_DEFAULT_START_HOUR,
      minute: BULK_PUBLISH_DEFAULT_START_MINUTE,
      second: 0,
      millisecond: 0,
    });
  const latestEastern = latestPublishAt
    ? DateTime.fromISO(String(latestPublishAt), { zone: "utc" })
        .setZone(EASTERN_TIMEZONE)
        .startOf("minute")
    : null;
  const anchor = latestEastern?.isValid && latestEastern > now
    ? latestEastern
    : now;
  const usesFixedSlots =
    normalizedHourOffset > 0 &&
    normalizedHourOffset < 24 &&
    24 % normalizedHourOffset === 0;
  const usesDailyStart = normalizedHourOffset === 24;
  let candidate;

  if (usesFixedSlots) {
    const startMinuteOfDay =
      BULK_PUBLISH_DEFAULT_START_HOUR * 60 + BULK_PUBLISH_DEFAULT_START_MINUTE;
    const gapMinutes = normalizedHourOffset * 60;
    const postsPerDay = Math.max(
      1,
      Math.floor((23 * 60 + 59 - startMinuteOfDay) / gapMinutes) + 1
    );
    let day = anchor.startOf("day");
    candidate = null;

    for (let dayOffset = 0; dayOffset < 370 && !candidate; dayOffset += 1) {
      const slotDay = day.plus({ days: dayOffset });

      for (let slotIndex = 0; slotIndex < postsPerDay; slotIndex += 1) {
        const minuteOfDay = startMinuteOfDay + slotIndex * gapMinutes;
        const slot = slotDay.set({
          hour: Math.floor(minuteOfDay / 60),
          minute: minuteOfDay % 60,
          second: 0,
          millisecond: 0,
        });

        if (slot > anchor && slot >= scheduleStart) {
          candidate = slot;
          break;
        }
      }
    }

    if (!candidate) {
      candidate = scheduleStart;
    }
  } else if (usesDailyStart) {
    candidate = firstDailyStart < scheduleStart ? scheduleStart : firstDailyStart;

    while (latestEastern?.isValid && candidate <= anchor) {
      candidate = candidate.plus({ days: 1 });
    }
  } else {
    candidate = anchor.plus({ hours: normalizedHourOffset });

    if (candidate < scheduleStart) {
      candidate = scheduleStart;
    }
  }

  return candidate
    .set({
      second: 0,
      millisecond: 0,
    })
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
