import {
  easternDateTimeInputToIso,
  EASTERN_TIMEZONE,
  getEasternNowParts,
  isoToEasternDateTimeInput,
} from "@/lib/utils/easternTime";

const DEFAULT_TIMEZONE = EASTERN_TIMEZONE;
const DEFAULT_POST_INTERVAL_HOURS = 2;
const DEFAULT_START_HOUR = 7;
const DEFAULT_START_MINUTE = 0;
// 2h grid from 7am ET (7, 9, 11, 1pm, 3pm, …) — effective starting Aug 1, 2026
const SCHEDULE_START_DATE = "2026-08-01";

const CAMPAIGN_INTERVALS = [
  {
    aliases: ["lptv", "lospollostv", "los-pollos-tv"],
    hourGap: 2,
    startHour: 7,
  },
  {
    aliases: ["kick"],
    hourGap: 2,
    startHour: 7,
  },
  {
    aliases: ["elephant"],
    hourGap: 2,
    startHour: 7,
  },
  {
    aliases: ["street"],
    hourGap: 2,
    startHour: 7,
  },
  {
    aliases: ["debate", "debates"],
    hourGap: 2,
    startHour: 7,
  },
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function normalizeCampaignValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCampaignValues(campaignContext = {}) {
  const context =
    typeof campaignContext === "string"
      ? { campaignSlug: campaignContext }
      : campaignContext || {};
  const campaign = context.campaign || {};

  return [
    context.campaignSlug,
    context.slug,
    context.label,
    context.niche,
    campaign.slug,
    campaign.label,
    campaign.niche,
  ]
    .map(normalizeCampaignValue)
    .filter(Boolean);
}

function matchesCampaignAlias(value, alias) {
  return value === alias || value === `${alias}-campaign`;
}

function getCampaignIntervalConfig(campaignContext = {}) {
  const values = getCampaignValues(campaignContext);

  return (
    CAMPAIGN_INTERVALS.find((config) =>
      values.some((value) =>
        config.aliases.some((alias) => matchesCampaignAlias(value, alias))
      )
    ) || {
      hourGap: DEFAULT_POST_INTERVAL_HOURS,
      startHour: DEFAULT_START_HOUR,
      startMinute: DEFAULT_START_MINUTE,
    }
  );
}

function buildScheduleConfig(config) {
  const normalizedHourGap = Number(config?.hourGap ?? DEFAULT_POST_INTERVAL_HOURS);
  const hourGap = Math.max(
    1,
    Number.isFinite(normalizedHourGap)
      ? normalizedHourGap
      : DEFAULT_POST_INTERVAL_HOURS
  );
  const normalizedStartHour = Number(config?.startHour ?? DEFAULT_START_HOUR);
  const startHour = Math.max(
    0,
    Math.min(
      23,
      Number.isFinite(normalizedStartHour)
        ? normalizedStartHour
        : DEFAULT_START_HOUR
    )
  );
  const defaultStartMinute =
    config?.startHour === undefined ? DEFAULT_START_MINUTE : 0;
  const normalizedStartMinute = Number(
    config?.startMinute ?? defaultStartMinute
  );
  const startMinute = Math.max(
    0,
    Math.min(
      59,
      Number.isFinite(normalizedStartMinute)
        ? normalizedStartMinute
        : defaultStartMinute
    )
  );
  const startMinuteOfDay = startHour * 60 + startMinute;
  const gapMinutes = hourGap * 60;
  // Full 24h cycle when gap divides the day (e.g. 2h → 12 slots, wraps past midnight)
  const wrapsFullDay = 24 % hourGap === 0;
  const availableMinutes = 23 * 60 + 59 - startMinuteOfDay;
  const postsPerDay = wrapsFullDay
    ? Math.max(1, Math.floor(24 / hourGap))
    : Math.max(1, Math.floor(availableMinutes / gapMinutes) + 1);

  return {
    postsPerDay,
    hourGap,
    startHour,
    startMinute,
    wrapsFullDay,
    gapMinutes,
  };
}

export function getCampaignPostIntervalHours(campaignContext = {}) {
  return buildScheduleConfig(getCampaignIntervalConfig(campaignContext)).hourGap;
}

export function getCampaignScheduleConfig(campaignContext = {}) {
  return buildScheduleConfig(getCampaignIntervalConfig(campaignContext));
}

export function getLastScheduledPublishAt(posts) {
  return posts
    .map((post) => post?.publish_at)
    .filter(Boolean)
    .map((value) => ({
      value,
      time: new Date(value).getTime(),
    }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((left, right) => right.time - left.time)[0]?.value || null;
}

function buildInput(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(
    parts.minute || 0
  )}`;
}

function getScheduleStartInput(config) {
  return `${SCHEDULE_START_DATE}T${pad(config.startHour)}:${pad(
    config.startMinute
  )}`;
}

function getScheduleStartIso(config) {
  return easternDateTimeInputToIso(getScheduleStartInput(config));
}

function startOfTomorrowInput(config) {
  const now = getEasternNowParts();
  const tomorrow = new Date(
    Date.UTC(now.year, now.month - 1, now.day + 1, 0, 0, 0)
  );

  return buildInput({
    year: tomorrow.getUTCFullYear(),
    month: tomorrow.getUTCMonth() + 1,
    day: tomorrow.getUTCDate(),
    hour: config.startHour,
    minute: config.startMinute,
  });
}

function startOfTomorrowIso(config) {
  return easternDateTimeInputToIso(startOfTomorrowInput(config));
}

function getStartMinuteOfDay(config) {
  return config.startHour * 60 + config.startMinute;
}

function splitMinuteOfDay(minuteOfDay) {
  return {
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  };
}

function applyScheduleStartFloor(isoValue, config) {
  const scheduleStartIso = getScheduleStartIso(config);

  return new Date(isoValue).getTime() < new Date(scheduleStartIso).getTime()
    ? scheduleStartIso
    : isoValue;
}

function applyDailyStartFloor(isoValue, config) {
  const floored = applyScheduleStartFloor(isoValue, config);

  if (config.hourGap < 24) {
    return floored;
  }

  const floorIso = applyScheduleStartFloor(startOfTomorrowIso(config), config);

  return new Date(floored).getTime() < new Date(floorIso).getTime()
    ? floorIso
    : floored;
}

function getInitialScheduleIso(config) {
  return applyScheduleStartFloor(startOfTomorrowIso(config), config);
}

function advanceEasternDayPrefix(dayPrefix, days = 1) {
  const nextDayDate = new Date(`${dayPrefix}T00:00:00Z`);
  nextDayDate.setUTCDate(nextDayDate.getUTCDate() + days);

  return `${nextDayDate.getUTCFullYear()}-${pad(
    nextDayDate.getUTCMonth() + 1
  )}-${pad(nextDayDate.getUTCDate())}`;
}

function minutesOnGridFromStart(minuteOfDay, config) {
  const startMinuteOfDay = getStartMinuteOfDay(config);
  const gapMinutes = config.gapMinutes || config.hourGap * 60;
  const dayMinutes = 24 * 60;

  return (minuteOfDay - startMinuteOfDay + dayMinutes) % dayMinutes;
}

function isExactScheduleSlot(hour, minute, config) {
  if (minute !== config.startMinute) {
    return false;
  }

  const gapMinutes = config.gapMinutes || config.hourGap * 60;
  const offset = minutesOnGridFromStart(hour * 60 + minute, config);

  return offset % gapMinutes === 0;
}

function easternInputFromDayAndMinutes(dayPrefix, totalMinutes) {
  const dayMinutes = 24 * 60;
  let dayOffset = Math.floor(totalMinutes / dayMinutes);
  let minuteOfDay = totalMinutes % dayMinutes;

  if (minuteOfDay < 0) {
    minuteOfDay += dayMinutes;
    dayOffset -= 1;
  }

  const day = dayOffset ? advanceEasternDayPrefix(dayPrefix, dayOffset) : dayPrefix;
  const time = splitMinuteOfDay(minuteOfDay);

  return `${day}T${pad(time.hour)}:${pad(time.minute)}`;
}

function getNextScheduleSlot(lastPublishAt, config) {
  if (!lastPublishAt) {
    return getInitialScheduleIso(config);
  }

  const easternInput = isoToEasternDateTimeInput(lastPublishAt);
  const [dayPrefix, timePart = ""] = easternInput.split("T");
  const [hour, minute] = timePart.split(":").map(Number);

  if (!dayPrefix || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return getInitialScheduleIso(config);
  }

  const startMinuteOfDay = getStartMinuteOfDay(config);
  const gapMinutes = config.gapMinutes || config.hourGap * 60;
  const dayMinutes = 24 * 60;
  const publishMinuteOfDay = hour * 60 + minute;
  const wrapsFullDay = config.wrapsFullDay === true || 24 % config.hourGap === 0;

  // Continuous gap across midnight (e.g. 11pm → 1am → 3am → …)
  if (wrapsFullDay) {
    const offsetFromStart = minutesOnGridFromStart(publishMinuteOfDay, config);
    const onSlot =
      minute === config.startMinute && offsetFromStart % gapMinutes === 0;
    const nextOffset = onSlot
      ? offsetFromStart + gapMinutes
      : Math.ceil((offsetFromStart + 1) / gapMinutes) * gapMinutes;
    // Anchor at start-of-cycle day: if current time is before startHour, cycle started previous day
    const cycleDayPrefix =
      publishMinuteOfDay < startMinuteOfDay
        ? advanceEasternDayPrefix(dayPrefix, -1)
        : dayPrefix;
    const nextIso = easternDateTimeInputToIso(
      easternInputFromDayAndMinutes(
        cycleDayPrefix,
        startMinuteOfDay + nextOffset
      )
    );

    if (new Date(nextIso).getTime() > new Date(lastPublishAt).getTime()) {
      return applyDailyStartFloor(nextIso, config);
    }

    return applyDailyStartFloor(
      easternDateTimeInputToIso(
        easternInputFromDayAndMinutes(
          cycleDayPrefix,
          startMinuteOfDay + nextOffset + gapMinutes
        )
      ),
      config
    );
  }

  // Daytime-only grid (gap does not divide 24h evenly)
  const slotIndex =
    publishMinuteOfDay < startMinuteOfDay
      ? -1
      : Math.floor((publishMinuteOfDay - startMinuteOfDay) / gapMinutes);

  if (slotIndex < config.postsPerDay - 1) {
    const nextTime = splitMinuteOfDay(
      startMinuteOfDay + (slotIndex + 1) * gapMinutes
    );
    const nextIso = easternDateTimeInputToIso(
      `${dayPrefix}T${pad(nextTime.hour)}:${pad(nextTime.minute)}`
    );

    if (new Date(nextIso).getTime() > new Date(lastPublishAt).getTime()) {
      return applyDailyStartFloor(nextIso, config);
    }
  }

  return applyDailyStartFloor(
    easternDateTimeInputToIso(
      `${advanceEasternDayPrefix(dayPrefix, 1)}T${pad(config.startHour)}:${pad(
        config.startMinute
      )}`
    ),
    config
  );
}

export function buildNextPublishDates({
  campaignSlug,
  existingPosts,
  count,
}) {
  const config = getCampaignScheduleConfig(campaignSlug);
  const results = [];
  let cursor = getNextScheduleSlot(
    getLastScheduledPublishAt(existingPosts),
    config
  );

  for (let index = 0; index < count; index++) {
    results.push(cursor);
    cursor = getNextScheduleSlot(cursor, config);
  }

  return results;
}

/**
 * Default bulk publish_at for a campaign:
  * next 2h grid slot after THIS campaign's latest post only (from 7am ET).
 * Keeps advancing until the slot is current/future.
 */
export function resolveDefaultCampaignPublishAt({
  campaignSlug,
  lastPublishAt = null,
  existingPosts = null,
  now = Date.now(),
} = {}) {
  const config = getCampaignScheduleConfig(campaignSlug);
  const latest =
    String(lastPublishAt || "").trim() ||
    getLastScheduledPublishAt(existingPosts || []);
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const floorMs = nowMs - 60 * 1000;

  let cursor = latest
    ? getNextScheduleSlot(latest, config)
    : getInitialScheduleIso(config);

  // If the immediate next slot is still in the past, walk forward 8h at a time
  // from this campaign's timeline only (never other campaigns).
  for (let step = 0; step < 500; step += 1) {
    const cursorMs = new Date(cursor).getTime();

    if (Number.isFinite(cursorMs) && cursorMs >= floorMs) {
      return cursor;
    }

    cursor = getNextScheduleSlot(cursor, config);
  }

  return cursor;
}

/**
 * Snap a publish time onto the campaign 2h grid (from 7am ET).
 * Exact slot times are kept; otherwise advances to the next slot at or after the input.
 */
export function snapPublishAtToScheduleSlot(publishAt, campaignContext = {}) {
  const config = getCampaignScheduleConfig(campaignContext);
  const input = String(publishAt || "").trim();

  if (!input) {
    return getInitialScheduleIso(config);
  }

  const easternInput = isoToEasternDateTimeInput(input) || input;
  const [dayPrefix, timePart = ""] = easternInput.split("T");
  const [hour, minute] = timePart.split(":").map(Number);

  if (!dayPrefix || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return getInitialScheduleIso(config);
  }

  const flooredInput = applyScheduleStartFloor(
    easternDateTimeInputToIso(
      `${dayPrefix}T${pad(hour)}:${pad(Number.isFinite(minute) ? minute : 0)}`
    ),
    config
  );

  // Already on a valid slot (including overnight grid points like 1am / 3am).
  if (isExactScheduleSlot(hour, minute, config)) {
    return flooredInput;
  }

  // One ms before so getNextScheduleSlot returns the next slot at/after this time.
  const anchorMs = new Date(flooredInput).getTime() - 1;
  const anchorIso = new Date(anchorMs).toISOString();

  return getNextScheduleSlot(anchorIso, config);
}

/** First slot is snapped basePublishAt; each next slot advances the campaign schedule. */
export function buildPublishSlotsFromBase({
  campaignSlug,
  basePublishAt,
  count,
}) {
  const slotCount = Math.max(0, Number(count) || 0);

  if (!slotCount) {
    return [];
  }

  const config = getCampaignScheduleConfig(campaignSlug);
  const base = String(basePublishAt || "").trim();
  const results = [];
  let cursor = base
    ? snapPublishAtToScheduleSlot(base, campaignSlug)
    : getInitialScheduleIso(config);

  results.push(cursor);

  for (let index = 1; index < slotCount; index += 1) {
    cursor = getNextScheduleSlot(cursor, config);
    results.push(cursor);
  }

  return results;
}

export function formatScheduleSummary(campaignSlug) {
  const config = getCampaignScheduleConfig(campaignSlug);

  return {
    timezone: DEFAULT_TIMEZONE,
    postsPerDay: config.postsPerDay,
    hourGap: config.hourGap,
    startHour: config.startHour,
    startMinute: config.startMinute,
    scheduleStartDate: SCHEDULE_START_DATE,
  };
}
