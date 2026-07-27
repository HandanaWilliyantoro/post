import axios from "axios";
import { DateTime } from "luxon";

import {
  getSocialPostResult,
  listLatestSocialPostResults,
} from "@/lib/postforme/posts";
import { ensurePostsCollection } from "@/lib/post/queries/listPosts";
import { EASTERN_TIMEZONE } from "@/lib/utils/easternTime";

export const PUBLISHED_URL_EXPORT_WINDOW_HOURS = 24;

const LATEST_POST_RESULT_LIMIT = 100;
const RESULT_DETAIL_CONCURRENCY = 1;
const RESULT_DETAIL_DELAY_MS = 500;
const POSTFORME_READ_MAX_ATTEMPTS = 5;
const POSTFORME_READ_MIN_DELAY_MS = 1000;
const POSTFORME_READ_MAX_DELAY_MS = 30000;
const POSTFORME_READ_MAX_TIMEOUT_MS = 2147483647;

function normalizeText(value) {
  return String(value || "").trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(normalizeText(value));
}

function normalizePlatform(value) {
  return normalizeText(value).toLowerCase();
}

function formatPublishedAt(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const normalizedValue = normalizeText(value);
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? normalizedValue : date.toISOString();
}

function formatPublishedAtForExport(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return "";
  }

  const datetime = DateTime.fromISO(normalizedValue, { zone: "utc" }).setZone(
    EASTERN_TIMEZONE
  );

  if (!datetime.isValid) {
    return normalizedValue;
  }

  return `${datetime.toFormat("MMM dd, yyyy, hh:mm a")} EST`;
}

function getPostPublishedAt(post = {}) {
  return formatPublishedAt(
    post?.exportPublishedAt ||
      post?.published_at ||
      post?.publish_at ||
      post?.scheduled_at ||
      post?.created_at
  );
}

function getResultPublishedAt(result = {}, fallback = "") {
  const details = result?.details || {};
  const platformData = result?.platform_data || {};

  return formatPublishedAt(
    result?.published_at ||
      result?.publish_at ||
      result?.posted_at ||
      result?.created_at ||
      platformData?.published_at ||
      platformData?.publish_at ||
      platformData?.posted_at ||
      details?.published_at ||
      details?.publish_at ||
      details?.posted_at ||
      fallback
  );
}

function normalizeExportWindowHours(value) {
  if (value === null || value === undefined || value === "") {
    return PUBLISHED_URL_EXPORT_WINDOW_HOURS;
  }

  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function findUrlInObject(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 3) {
    return "";
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      typeof nestedValue === "string" &&
      key.toLowerCase().includes("url") &&
      isHttpUrl(nestedValue)
    ) {
      return nestedValue;
    }

    if (nestedValue && typeof nestedValue === "object") {
      const nestedUrl = findUrlInObject(nestedValue, depth + 1);

      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  return "";
}

function isLikelyPostUrl(value, platform) {
  if (!isHttpUrl(value)) {
    return false;
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const path = url.pathname.toLowerCase();
  const normalizedPlatform = normalizePlatform(platform);

  if (normalizedPlatform === "tiktok") {
    return path.includes("/video/") || path.includes("/photo/");
  }

  if (normalizedPlatform === "instagram") {
    return ["/p/", "/reel/", "/reels/", "/tv/"].some((part) =>
      path.includes(part)
    );
  }

  if (["x", "twitter"].includes(normalizedPlatform)) {
    return path.includes("/status/");
  }

  if (normalizedPlatform === "youtube") {
    return (
      url.hostname.toLowerCase() === "youtu.be" ||
      path.includes("/shorts/") ||
      path.includes("/live/") ||
      (path === "/watch" && Boolean(url.searchParams.get("v")))
    );
  }

  return true;
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

function clampDelayMs(delayMs, minimumDelayMs = 0) {
  const normalizedDelayMs = Number(delayMs);

  if (!Number.isFinite(normalizedDelayMs) || normalizedDelayMs <= 0) {
    return minimumDelayMs;
  }

  return Math.min(
    Math.max(normalizedDelayMs, minimumDelayMs),
    POSTFORME_READ_MAX_DELAY_MS,
    POSTFORME_READ_MAX_TIMEOUT_MS
  );
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, clampDelayMs(delayMs)));
}

function parseRetryAfterMs(retryAfter) {
  const normalizedRetryAfter = normalizeText(retryAfter);

  if (!normalizedRetryAfter) {
    return null;
  }

  const retryAfterNumber = Number(normalizedRetryAfter);

  if (Number.isFinite(retryAfterNumber) && retryAfterNumber >= 0) {
    const retryAfterMs =
      retryAfterNumber > 1000000000
        ? retryAfterNumber * 1000 - Date.now()
        : retryAfterNumber * 1000;

    return clampDelayMs(retryAfterMs);
  }

  const retryAfterDate = Date.parse(normalizedRetryAfter);

  if (Number.isFinite(retryAfterDate)) {
    return clampDelayMs(retryAfterDate - Date.now());
  }

  return null;
}

function getRetryAfterMs(error, attempt) {
  const parsedRetryAfterMs = parseRetryAfterMs(
    error?.response?.headers?.["retry-after"]
  );

  if (parsedRetryAfterMs !== null) {
    return clampDelayMs(parsedRetryAfterMs, POSTFORME_READ_MIN_DELAY_MS);
  }

  return clampDelayMs(1000 * 2 ** attempt, POSTFORME_READ_MIN_DELAY_MS);
}

async function retryPostForMeRead(operation) {
  for (let attempt = 0; attempt < POSTFORME_READ_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      const retryable = status === 408 || status === 429 || status >= 500;

      if (!retryable || attempt === POSTFORME_READ_MAX_ATTEMPTS - 1) {
        throw error;
      }

      await wait(getRetryAfterMs(error, attempt));
    }
  }

  return null;
}

function findTikTokAccessToken(result = {}) {
  const responses = Array.isArray(result?.details?.responses)
    ? result.details.responses
    : [];

  for (let index = responses.length - 1; index >= 0; index -= 1) {
    const token = normalizeText(responses[index]?.refreshResponse?.access_token);

    if (token) {
      return token;
    }
  }

  return "";
}

function findTikTokPublicPostId(result = {}) {
  const responses = Array.isArray(result?.details?.responses)
    ? result.details.responses
    : [];

  for (let index = responses.length - 1; index >= 0; index -= 1) {
    const ids = responses[index]?.statusResponse?.data
      ?.publicaly_available_post_id;
    const id = normalizeText(Array.isArray(ids) ? ids[0] : ids);

    if (id) {
      return id;
    }
  }

  return "";
}

async function fetchTikTokPublicPostId(result = {}) {
  const existingId = findTikTokPublicPostId(result);

  if (existingId) {
    return existingId;
  }

  const accessToken = findTikTokAccessToken(result);
  const publishId = normalizeText(result?.details?.publish_id);

  if (!accessToken || !publishId) {
    return "";
  }

  try {
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      { publish_id: publishId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        proxy: false,
        responseType: "text",
        timeout: 30000,
        transformResponse: [(data) => data],
      }
    );
    const rawResponse = String(response?.data || "");
    const match = rawResponse.match(
      /"publicaly_available_post_id"\s*:\s*\[\s*"?(\d+)"?/i
    );

    return match?.[1] || "";
  } catch {
    return "";
  }
}

export async function getPublishedResultUrl(
  result = {},
  account = {},
  options = {}
) {
  const platformData = result?.platform_data || {};
  const details = result?.details || {};
  const platform = normalizePlatform(account?.platform || result?.platform);
  const candidates = [
    result?.platform_post_url,
    result?.platform_url,
    platformData?.platform_post_url,
    platformData?.platform_url,
    platformData?.permalink,
    platformData?.post_url,
    platformData?.share_url,
    platformData?.url,
    details?.platform_post_url,
    details?.platform_url,
    details?.permalink,
    details?.post_url,
    details?.share_url,
    details?.url,
    findUrlInObject(platformData),
    findUrlInObject(details),
  ]
    .map(normalizeText)
    .filter(Boolean);
  const explicitPostUrl = candidates.find((url) =>
    isLikelyPostUrl(url, platform)
  ) || candidates.find(isHttpUrl);

  if (explicitPostUrl) {
    return explicitPostUrl;
  }

  if (platform === "tiktok") {
    const username = normalizeText(
      account?.username || details?.username
    ).replace(/^@+/, "");
    const existingPlatformPostId = findTikTokPublicPostId(result);
    const platformPostId = existingPlatformPostId ||
      (options.resolveRemoteTikTokId === false
        ? ""
        : await fetchTikTokPublicPostId(result));

    if (username && platformPostId) {
      return `https://www.tiktok.com/@${encodeURIComponent(
        username
      )}/video/${encodeURIComponent(platformPostId)}`;
    }
  }

  return "";
}

function resolveExportDateExpression() {
  const convertToDate = (input) => ({
    $convert: {
      input,
      to: "date",
      onError: null,
      onNull: null,
    },
  });

  return {
    $ifNull: [
      convertToDate("$publish_at"),
      {
        $ifNull: [
          convertToDate("$scheduled_at"),
          convertToDate("$created_at"),
        ],
      },
    ],
  };
}

async function listPublishedPostCandidates({ campaignSlug, cutoff, now }) {
  const collection = await ensurePostsCollection();
  const publishedAtQuery = cutoff
    ? { $gte: cutoff, $lte: now }
    : { $lte: now };

  return collection
    .aggregate([
      {
        $match: {
          campaignSlug,
          localOnly: { $ne: true },
          status: { $nin: ["cancelled", "failed", "draft"] },
        },
      },
      {
        $set: {
          exportPublishedAt: resolveExportDateExpression(),
        },
      },
      {
        $match: {
          exportPublishedAt: publishedAtQuery,
        },
      },
      {
        $project: {
          _id: 0,
          created_at: 1,
          id: 1,
          exportPublishedAt: 1,
          publish_at: 1,
          published_at: 1,
          publishCallback: 1,
          postResults: 1,
          scheduled_at: 1,
          social_accounts: 1,
          status: 1,
          targets: 1,
        },
      },
      { $sort: { exportPublishedAt: -1, id: 1 } },
    ])
    .toArray();
}

function buildAccountMap(posts = []) {
  const accountsById = new Map();

  for (const post of posts) {
    const accounts = [
      ...(Array.isArray(post?.targets) ? post.targets : []),
      ...(Array.isArray(post?.social_accounts) ? post.social_accounts : []),
    ];

    for (const account of accounts) {
      const accountId = normalizeText(account?.account_id || account?.id);
      const username = normalizeText(account?.username).replace(/[\r\n]+/g, " ");
      const platform = normalizePlatform(account?.platform);

      if (accountId && !accountsById.has(accountId)) {
        accountsById.set(accountId, {
          account_id: accountId,
          username,
          platform,
        });
      }
    }
  }

  return accountsById;
}

function normalizeAccount(account = {}) {
  const accountId = normalizeText(
    account?.account_id || account?.id || account?.social_account_id
  );

  return {
    accountId,
    username: normalizeText(
      account?.username || account?.social_account?.username
    ).replace(/[\r\n]+/g, " "),
    platform: normalizePlatform(
      account?.platform || account?.social_account?.platform
    ),
  };
}

function addGroupedUrl(groupedUrls, account = {}, url = "", publishedAt = "") {
  const normalizedUrl = normalizeText(url);
  const normalizedAccount = normalizeAccount(account);
  const normalizedPublishedAt = formatPublishedAt(publishedAt);

  if (!isHttpUrl(normalizedUrl)) {
    return false;
  }

  const username =
    normalizedAccount.username || normalizedAccount.accountId || "Unknown";
  const groupKey = username.toLowerCase();
  const group = groupedUrls.get(groupKey) || {
    username,
    urls: new Map(),
  };
  const existingEntry = group.urls.get(normalizedUrl);

  if (!existingEntry || normalizedPublishedAt) {
    group.urls.set(normalizedUrl, {
      url: normalizedUrl,
      publishedAt: normalizedPublishedAt,
    });
  }

  groupedUrls.set(groupKey, group);
  return true;
}

function findAccountForCallbackUrl(post = {}) {
  const targets = Array.isArray(post?.targets) ? post.targets : [];
  const instagramTarget = targets.find(
    (target) => normalizePlatform(target?.platform) === "instagram"
  );

  return instagramTarget || targets[0] || {};
}

function collectTargetPublishedUrls(post = {}, groupedUrls) {
  const targets = Array.isArray(post?.targets) ? post.targets : [];
  const publishedAt = getPostPublishedAt(post);

  for (const target of targets) {
    [
      target?.platform_post_url,
      target?.platform_url,
      target?.permalink,
      target?.post_url,
      target?.share_url,
    ].forEach((url) => addGroupedUrl(groupedUrls, target, url, publishedAt));
  }
}

async function collectStoredResultUrls(post = {}, accountMap, groupedUrls) {
  const postResults = Array.isArray(post?.postResults) ? post.postResults : [];

  for (const result of postResults) {
    if (result?.success !== true) {
      continue;
    }

    const accountId = normalizeText(result?.social_account_id);
    const account = {
      account_id: accountId,
      ...(accountMap.get(accountId) || result?.social_account || {}),
    };
    const url = await getPublishedResultUrl(result, account);
    const publishedAt = getResultPublishedAt(result, getPostPublishedAt(post));

    addGroupedUrl(groupedUrls, account, url, publishedAt);
  }
}

async function collectStoredPublishedUrls(posts = [], accountMap, groupedUrls) {
  for (const post of posts) {
    collectTargetPublishedUrls(post, groupedUrls);

    const callbackUrl = normalizeText(post?.publishCallback?.instagramUrl);
    if (callbackUrl) {
      addGroupedUrl(
        groupedUrls,
        findAccountForCallbackUrl(post),
        callbackUrl,
        getPostPublishedAt(post)
      );
    }

    await collectStoredResultUrls(post, accountMap, groupedUrls);
  }
}

function mergeDetailedResult(summaryResult = {}, detailedResult = {}) {
  return {
    ...summaryResult,
    ...(detailedResult || {}),
    id: normalizeText(detailedResult?.id || summaryResult?.id),
    post_id: normalizeText(
      detailedResult?.post_id ||
        detailedResult?.social_post_id ||
        summaryResult?.post_id ||
        summaryResult?.social_post_id
    ),
    social_account_id: normalizeText(
      detailedResult?.social_account_id || summaryResult?.social_account_id
    ),
    success:
      detailedResult?.success === true || detailedResult?.success === false
        ? detailedResult.success
        : summaryResult?.success,
  };
}

async function loadPostResults(
  posts = [],
  accountMap = new Map(),
  options = {}
) {
  const postIds = new Set(
    posts.map((post) => normalizeText(post?.id)).filter(Boolean)
  );
  const includeRemoteDetails = options.includeRemoteDetails === true;

  if (!postIds.size) {
    return [];
  }

  const latestResults = await retryPostForMeRead(() =>
    listLatestSocialPostResults({
      limit: LATEST_POST_RESULT_LIMIT,
      suppressErrorLog: true,
    })
  );
  const successfulResults = (Array.isArray(latestResults) ? latestResults : [])
    .map((result) => ({
      ...result,
      post_id: normalizeText(result?.post_id || result?.social_post_id),
    }))
    .filter(
      (result) =>
        result?.success === true &&
        normalizeText(result?.id) &&
        postIds.has(normalizeText(result?.post_id))
    );

  if (!includeRemoteDetails) {
    return successfulResults;
  }

  const summaryResults = [];
  const resultsNeedingDetails = [];

  for (const result of successfulResults) {
    const accountId = normalizeText(result?.social_account_id);
    const account = {
      account_id: accountId,
      ...(accountMap.get(accountId) || result?.social_account || {}),
    };
    const summaryUrl = await getPublishedResultUrl(result, account, {
      resolveRemoteTikTokId: false,
    });

    if (summaryUrl) {
      summaryResults.push(result);
    } else {
      resultsNeedingDetails.push(result);
    }
  }

  const detailedResults = await mapWithConcurrency(
    resultsNeedingDetails,
    RESULT_DETAIL_CONCURRENCY,
    async (result) => {
      let detailedResult = null;

      try {
        detailedResult = await retryPostForMeRead(() =>
          getSocialPostResult(result.id, { suppressErrorLog: true })
        );
      } catch {
        detailedResult = null;
      }

      await wait(RESULT_DETAIL_DELAY_MS);
      return mergeDetailedResult(result, detailedResult);
    }
  );

  return [...summaryResults, ...detailedResults];
}

export function formatPublishedUrlExport(groups = []) {
  return groups
    .map(
      ({ username, urls }) =>
        `${username}:\r\n${urls
          .map(({ url, publishedAt }) =>
            `${url} | ${formatPublishedAtForExport(publishedAt)}`
          )
          .join("\r\n")}`
    )
    .join("\r\n\r\n") + (groups.length ? "\r\n" : "");
}

export async function buildPublishedUrlExport({
  campaignSlug,
  includeRemoteDetails = false,
  now = new Date(),
  windowHours = PUBLISHED_URL_EXPORT_WINDOW_HOURS,
}) {
  const normalizedCampaignSlug = normalizeText(campaignSlug);
  const resolvedNow = now instanceof Date ? now : new Date(now);
  const normalizedWindowHours = normalizeExportWindowHours(windowHours);

  if (!normalizedCampaignSlug) {
    throw new Error("campaignSlug is required");
  }

  if (Number.isNaN(resolvedNow.getTime())) {
    throw new Error("Invalid export time");
  }

  const cutoff = normalizedWindowHours
    ? new Date(resolvedNow.getTime() - normalizedWindowHours * 60 * 60 * 1000)
    : null;
  const posts = await listPublishedPostCandidates({
    campaignSlug: normalizedCampaignSlug,
    cutoff,
    now: resolvedNow,
  });
  const accountMap = buildAccountMap(posts);
  const postIds = new Set(
    posts.map((post) => normalizeText(post?.id)).filter(Boolean)
  );
  const publishedAtByPostId = new Map(
    posts
      .map((post) => [normalizeText(post?.id), getPostPublishedAt(post)])
      .filter(([postId]) => postId)
  );
  const groupedUrls = new Map();
  await collectStoredPublishedUrls(posts, accountMap, groupedUrls);

  const results = await loadPostResults(posts, accountMap, {
    includeRemoteDetails,
  });

  for (const result of results) {
    const resultPostId = normalizeText(result?.post_id || result?.social_post_id);

    if (
      result?.success !== true ||
      (resultPostId && !postIds.has(resultPostId))
    ) {
      continue;
    }

    const accountId = normalizeText(result?.social_account_id);
    const account = {
      account_id: accountId,
      ...(accountMap.get(accountId) || result?.social_account || {}),
    };
    const url = await getPublishedResultUrl(result, account, {
      resolveRemoteTikTokId: includeRemoteDetails,
    });
    const publishedAt = getResultPublishedAt(
      result,
      publishedAtByPostId.get(resultPostId)
    );

    addGroupedUrl(groupedUrls, account, url, publishedAt);
  }

  const groups = [...groupedUrls.values()]
    .map((group) => ({
      username: group.username,
      urls: [...group.urls.values()],
    }))
    .sort((left, right) =>
      left.username.localeCompare(right.username, undefined, {
        sensitivity: "base",
      })
    );

  return {
    content: formatPublishedUrlExport(groups),
    cutoff: cutoff ? cutoff.toISOString() : null,
    generatedAt: resolvedNow.toISOString(),
    windowHours: normalizedWindowHours,
    postCount: posts.length,
    urlCount: groups.reduce((count, group) => count + group.urls.length, 0),
    usernameCount: groups.length,
  };
}
