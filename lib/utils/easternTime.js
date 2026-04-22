export const EASTERN_TIMEZONE = "America/New_York";

function pad(value) {
  return String(value).padStart(2, "0");
}

function getFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function getTimeZoneParts(date, timeZone = EASTERN_TIMEZONE) {
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function parseInputParts(value) {
  const match = String(value || "")
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
    );

  if (!match) {
    throw new Error("Invalid datetime input");
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
}

function partsToUtcMs(parts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second || 0
  );
}

export function easternDateTimeInputToIso(value) {
  const desired = parseInputParts(value);
  let guess = partsToUtcMs(desired);

  for (let index = 0; index < 4; index++) {
    const actualParts = getTimeZoneParts(new Date(guess), EASTERN_TIMEZONE);
    const diff = partsToUtcMs(desired) - partsToUtcMs(actualParts);
    guess += diff;

    if (diff === 0) {
      break;
    }
  }

  return new Date(guess).toISOString();
}

export function isoToEasternDateTimeInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = getTimeZoneParts(date, EASTERN_TIMEZONE);

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(
    parts.minute
  )}`;
}

export function getEasternDateTimeInputAfterMinutes(minutes = 60) {
  const date = new Date(Date.now() + Number(minutes || 0) * 60 * 1000);
  const parts = getTimeZoneParts(date, EASTERN_TIMEZONE);

  parts.minute = 0;
  parts.second = 0;

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(
    parts.minute
  )}`;
}

export function formatEasternDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIMEZONE,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function getEasternNowParts() {
  return getTimeZoneParts(new Date(), EASTERN_TIMEZONE);
}
