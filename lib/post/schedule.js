import {
  easternDateTimeInputToIso,
  EASTERN_TIMEZONE,
  getEasternNowParts,
  isoToEasternDateTimeInput,
} from "@/lib/utils/easternTime";

const DEFAULT_TIMEZONE = EASTERN_TIMEZONE;

const CAMPAIGN_SCHEDULES = {
  "kick-campaign": {
    postsPerDay: 10,
    hourGap: 2,
    startHour: 6,
  },
  "lospollostv-campaign": {
    postsPerDay: 20,
    hourGap: 1,
    startHour: 4,
  },
};

function pad(value) {
  return String(value).padStart(2, "0");
}

export function getCampaignScheduleConfig(campaignSlug) {
  return (
    CAMPAIGN_SCHEDULES[campaignSlug] || {
      postsPerDay: 10,
      hourGap: 2,
      startHour: 6,
    }
  );
}

export function getLastScheduledPublishAt(posts) {
  return posts
    .map((post) => post?.publish_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;
}

function buildInput(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(
    parts.minute || 0
  )}`;
}

function startOfTomorrowInput() {
  const now = getEasternNowParts();
  const tomorrow = new Date(
    Date.UTC(now.year, now.month - 1, now.day + 1, 0, 0, 0)
  );

  return buildInput({
    year: tomorrow.getUTCFullYear(),
    month: tomorrow.getUTCMonth() + 1,
    day: tomorrow.getUTCDate(),
    hour: 0,
    minute: 0,
  });
}

function getNextScheduleSlot(lastPublishAt, config) {
  if (!lastPublishAt) {
    const tomorrowInput = startOfTomorrowInput();
    const dayPrefix = tomorrowInput.slice(0, 10);
    return easternDateTimeInputToIso(`${dayPrefix}T${pad(config.startHour)}:00`);
  }

  const easternInput = isoToEasternDateTimeInput(lastPublishAt);
  const [dayPrefix, timePart] = easternInput.split("T");
  const [hour, minute] = timePart.split(":").map(Number);
  const slotIndex =
    hour < config.startHour
      ? -1
      : Math.floor((hour - config.startHour) / config.hourGap);

  if (slotIndex < config.postsPerDay - 1) {
    const nextHour = config.startHour + (slotIndex + 1) * config.hourGap;
    const nextIso = easternDateTimeInputToIso(`${dayPrefix}T${pad(nextHour)}:${pad(minute)}`);

    if (new Date(nextIso).getTime() > new Date(lastPublishAt).getTime()) {
      return nextIso;
    }
  }

  const nextDayDate = new Date(`${dayPrefix}T00:00:00Z`);
  nextDayDate.setUTCDate(nextDayDate.getUTCDate() + 1);
  const nextDayPrefix = `${nextDayDate.getUTCFullYear()}-${pad(
    nextDayDate.getUTCMonth() + 1
  )}-${pad(nextDayDate.getUTCDate())}`;

  return easternDateTimeInputToIso(`${nextDayPrefix}T${pad(config.startHour)}:00`);
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

export function formatScheduleSummary(campaignSlug) {
  const config = getCampaignScheduleConfig(campaignSlug);

  return {
    timezone: DEFAULT_TIMEZONE,
    postsPerDay: config.postsPerDay,
    hourGap: config.hourGap,
  };
}
