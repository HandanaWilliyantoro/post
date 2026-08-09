import { DateTime } from "luxon";

import { getAccounts } from "@/lib/accounts/getAccounts";
import { listSocialAccountFeed } from "@/lib/postforme/feeds";
import { EASTERN_TIMEZONE } from "@/lib/utils/easternTime";

const FEED_CONCURRENCY = 2;
const FEED_PAGE_LIMIT = 50;
const FEED_MAX_PAGES = 4;

function normalizeText(value) {
  return String(value || "").trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(normalizeText(value));
}

function cleanPostUrl(value) {
  const normalized = normalizeText(value);

  if (!isHttpUrl(normalized)) {
    return "";
  }

  try {
    const url = new URL(normalized);
    // Drop tracking query params but keep path
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return normalized.split("?")[0];
  }
}

function isLikelyProfileUrl(value) {
  if (!isHttpUrl(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const segments = path.split("/").filter(Boolean);

    if (host.includes("tiktok.com")) {
      return (
        segments.length === 1 &&
        segments[0].startsWith("@") &&
        !path.includes("/video/") &&
        !path.includes("/photo/")
      );
    }

    if (host.includes("instagram.com")) {
      if (["p", "reel", "reels", "tv", "stories"].includes(segments[0])) {
        return false;
      }

      return segments.length <= 1;
    }

    return false;
  } catch {
    return false;
  }
}

function isLikelyPostUrl(value) {
  if (!isHttpUrl(value) || isLikelyProfileUrl(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase();

    if (host.includes("tiktok.com")) {
      return path.includes("/video/") || path.includes("/photo/");
    }

    if (host.includes("instagram.com")) {
      return ["/p/", "/reel/", "/reels/", "/tv/"].some((part) =>
        path.includes(part)
      );
    }

    if (host === "x.com" || host === "twitter.com") {
      return path.includes("/status/");
    }

    if (host.includes("youtube.com") || host === "youtu.be") {
      return (
        host === "youtu.be" ||
        path.includes("/shorts/") ||
        path.includes("/live/") ||
        (path === "/watch" && Boolean(url.searchParams.get("v")))
      );
    }

    return true;
  } catch {
    return false;
  }
}

function extractFeedPostUrl(item = {}, account = {}) {
  const candidates = [
    item?.platform_url,
    item?.platform_post_url,
    item?.permalink,
    item?.post_url,
    item?.share_url,
    item?.url,
    item?.media?.[0]?.url,
  ]
    .map(normalizeText)
    .filter(Boolean);

  const direct = candidates.find((url) => isLikelyPostUrl(url));

  if (direct) {
    return cleanPostUrl(direct);
  }

  // Reconstruct TikTok video URL from platform_post_id when needed
  const platform = normalizeText(item?.platform || account?.platform).toLowerCase();
  const username = normalizeText(account?.username || item?.username).replace(
    /^@+/,
    ""
  );
  const platformPostId = normalizeText(
    item?.platform_post_id || item?.id || item?.post_id
  );

  if (
    username &&
    platformPostId &&
    (platform.includes("tiktok") ||
      candidates.some((url) => /tiktok\.com/i.test(url)))
  ) {
    return `https://www.tiktok.com/@${encodeURIComponent(
      username
    )}/video/${encodeURIComponent(platformPostId)}`;
  }

  return "";
}

function getTodayAndYesterdayRangeEt(now = DateTime.now()) {
  const easternNow = (
    now instanceof DateTime ? now : DateTime.fromJSDate(now)
  ).setZone(EASTERN_TIMEZONE);

  const start = easternNow.minus({ days: 1 }).startOf("day");
  const end = easternNow.endOf("day");

  return {
    start,
    end,
    startIso: start.toUTC().toISO(),
    endIso: end.toUTC().toISO(),
    labels: {
      today: easternNow.toFormat("yyyy-MM-dd"),
      yesterday: easternNow.minus({ days: 1 }).toFormat("yyyy-MM-dd"),
    },
  };
}

function isPostedInRange(postedAt, start, end) {
  if (!postedAt) {
    return false;
  }

  const dt = DateTime.fromISO(String(postedAt), { zone: "utc" }).setZone(
    EASTERN_TIMEZONE
  );

  if (!dt.isValid) {
    return false;
  }

  return dt >= start && dt <= end;
}

function formatPostedAtForExport(value) {
  if (!value) {
    return "";
  }

  const dt = DateTime.fromISO(String(value), { zone: "utc" }).setZone(
    EASTERN_TIMEZONE
  );

  if (!dt.isValid) {
    return String(value);
  }

  return `${dt.toFormat("MMM dd, yyyy, hh:mm a")} EST`;
}

async function mapWithConcurrency(items, limit, iteratee) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  const workerCount = Math.max(1, Math.min(limit, list.length || 1));
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await iteratee(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function formatPublishedUrlExport(groups = []) {
  return (
    groups
      .map(
        ({ username, urls }) =>
          `${username}:\r\n${urls
            .map(
              ({ url, postedAt }) =>
                `${url} | ${formatPostedAtForExport(postedAt)}`
            )
            .join("\r\n")}`
      )
      .join("\r\n\r\n") + (groups.length ? "\r\n" : "")
  );
}

/**
 * Export post URLs for a campaign via:
 * GET /v1/social-account-feeds/{social_account_id}
 * Filtered to posts from yesterday 00:00 ET through today 23:59 ET.
 */
export async function buildPublishedUrlExport({
  campaignSlug,
  now = DateTime.now(),
} = {}) {
  const normalizedCampaignSlug = normalizeText(campaignSlug);

  if (!normalizedCampaignSlug) {
    throw new Error("campaignSlug is required");
  }

  const range = getTodayAndYesterdayRangeEt(now);
  const accounts = await getAccounts({ campaignSlug: normalizedCampaignSlug });
  const activeAccounts = (Array.isArray(accounts) ? accounts : [])
    .map((account) => ({
      id: normalizeText(account?.id || account?.account_id),
      username: normalizeText(account?.username).replace(/^@+/, ""),
      platform: normalizeText(account?.platform).toLowerCase(),
    }))
    .filter((account) => account.id);

  const groupedUrls = new Map();
  let feedItemCount = 0;
  let matchedItemCount = 0;

  await mapWithConcurrency(activeAccounts, FEED_CONCURRENCY, async (account) => {
    let feedItems = [];

    try {
      feedItems = await listSocialAccountFeed(account.id, {
        limit: FEED_PAGE_LIMIT,
        maxPages: FEED_MAX_PAGES,
        suppressErrorLog: true,
      });
    } catch {
      feedItems = [];
    }

    feedItemCount += feedItems.length;

    const username = account.username || account.id;
    const groupKey = username.toLowerCase();
    const group = groupedUrls.get(groupKey) || {
      username,
      urls: new Map(),
    };

    for (const item of feedItems) {
      if (!isPostedInRange(item?.posted_at, range.start, range.end)) {
        continue;
      }

      matchedItemCount += 1;
      const url = extractFeedPostUrl(item, account);

      if (!url || !isLikelyPostUrl(url)) {
        continue;
      }

      const postedAt = normalizeText(item?.posted_at);
      const existing = group.urls.get(url);

      if (!existing || postedAt) {
        group.urls.set(url, {
          url,
          postedAt,
        });
      }
    }

    if (group.urls.size) {
      groupedUrls.set(groupKey, group);
    }
  });

  const groups = [...groupedUrls.values()]
    .map((group) => ({
      username: group.username,
      urls: [...group.urls.values()].sort((left, right) =>
        String(right.postedAt || "").localeCompare(String(left.postedAt || ""))
      ),
    }))
    .sort((left, right) =>
      left.username.localeCompare(right.username, undefined, {
        sensitivity: "base",
      })
    );

  return {
    content: formatPublishedUrlExport(groups),
    generatedAt: DateTime.now().toUTC().toISO(),
    rangeStart: range.startIso,
    rangeEnd: range.endIso,
    today: range.labels.today,
    yesterday: range.labels.yesterday,
    accountCount: activeAccounts.length,
    feedItemCount,
    matchedItemCount,
    urlCount: groups.reduce((count, group) => count + group.urls.length, 0),
    usernameCount: groups.length,
  };
}
