import { getAccounts } from "@/lib/accounts/getAccounts";

const INSTAGRAM_APP_ID = "936619743392459";
const INSTAGRAM_ASBD_ID = "129477";
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_URLS_PER_LINE = 10;
const REQUEST_GAP_MS = 1200;

function createInstagramHeaders(username) {
  return {
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `https://www.instagram.com/${username}/`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "X-ASBD-ID": INSTAGRAM_ASBD_ID,
    "X-IG-App-ID": INSTAGRAM_APP_ID,
    "X-Requested-With": "XMLHttpRequest",
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeEdges(payload) {
  const graphqlEdges =
    payload?.data?.user?.edge_owner_to_timeline_media?.edges ||
    payload?.graphql?.user?.edge_owner_to_timeline_media?.edges;

  if (Array.isArray(graphqlEdges)) {
    return graphqlEdges;
  }

  const apiItems = payload?.data?.user?.timeline_media?.edges;

  return Array.isArray(apiItems) ? apiItems : [];
}

function getNodeUrl(node) {
  const shortcode = String(node?.shortcode || "").trim();

  if (!shortcode) {
    return "";
  }

  return `https://www.instagram.com/p/${shortcode}/`;
}

function isRecentNode(node, cutoffTime) {
  const timestampSeconds = Number(node?.taken_at_timestamp || 0);

  if (!timestampSeconds) {
    return false;
  }

  return timestampSeconds * 1000 >= cutoffTime;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractSharedDataFromHtml(html) {
  const patterns = [
    /window\._sharedData\s*=\s*(\{[\s\S]*?\})\s*;/,
    /"edge_owner_to_timeline_media":\s*(\{[\s\S]*?"page_info":\{[\s\S]*?\}\})/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const parsed = tryParseJson(match[1]);

    if (parsed) {
      return parsed;
    }
  }

  const userIdMatch = html.match(/"profilePage_([0-9]+)"/);
  const timelineMatch = html.match(
    /"edge_owner_to_timeline_media":\s*(\{[\s\S]*?"page_info":\{[\s\S]*?\}\})/
  );

  if (userIdMatch?.[1] && timelineMatch?.[1]) {
    const parsedTimeline = tryParseJson(timelineMatch[1]);

    if (parsedTimeline) {
      return {
        graphql: {
          user: {
            id: userIdMatch[1],
            edge_owner_to_timeline_media: parsedTimeline,
          },
        },
      };
    }
  }

  return null;
}

async function fetchRecentPostsFromHtml(username, cutoffTime, headers) {
  const response = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    headers: {
      ...headers,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${response.status} https://www.instagram.com/${username}/`);
  }

  const html = await response.text();
  const payload = extractSharedDataFromHtml(html);
  const edges = normalizeEdges(payload);

  if (!edges.length) {
    throw new Error(`No timeline data found in https://www.instagram.com/${username}/`);
  }

  return edges
    .map((edge) => edge?.node || null)
    .filter(Boolean)
    .filter((node) => isRecentNode(node, cutoffTime))
    .map((node) => ({
      username,
      publishedAt: new Date(Number(node.taken_at_timestamp) * 1000).toISOString(),
      url: getNodeUrl(node),
    }))
    .filter((post) => post.url);
}

async function fetchRecentAccountPosts(username, cutoffTime) {
  const normalizedUsername = String(username || "").trim().replace(/^@/, "");

  if (!normalizedUsername) {
    return [];
  }

  const headers = createInstagramHeaders(normalizedUsername);
  const endpoints = [
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
      normalizedUsername
    )}`,
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
      normalizedUsername
    )}`,
    `https://www.instagram.com/${encodeURIComponent(normalizedUsername)}/?__a=1&__d=dis`,
  ];
  const failures = [];
  let posts = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers,
        cache: "no-store",
      });

      if (!response.ok) {
        failures.push(`${response.status} ${endpoint}`);
        continue;
      }

      const payload = await response.json();
      const edges = normalizeEdges(payload);

      if (edges.length) {
        posts = edges
          .map((edge) => edge?.node || null)
          .filter(Boolean)
          .filter((node) => isRecentNode(node, cutoffTime))
          .map((node) => ({
            username: normalizedUsername,
            publishedAt: new Date(Number(node.taken_at_timestamp) * 1000).toISOString(),
            url: getNodeUrl(node),
          }))
          .filter((post) => post.url);
        break;
      }
    } catch (error) {
      failures.push(`${error?.message || "request failed"} ${endpoint}`);
    }
  }

  if (!posts.length) {
    try {
      posts = await fetchRecentPostsFromHtml(normalizedUsername, cutoffTime, headers);
    } catch (error) {
      failures.push(error?.message || `https://www.instagram.com/${normalizedUsername}/`);
    }
  }

  if (!posts.length) {
    throw new Error(
      `Instagram lookup failed for ${normalizedUsername}${
        failures.length ? ` (${failures.join(" | ")})` : ""
      }`
    );
  }

  return posts;
}

function formatUrlLines(urls) {
  const lines = [];

  for (let index = 0; index < urls.length; index += MAX_URLS_PER_LINE) {
    lines.push(urls.slice(index, index + MAX_URLS_PER_LINE).join(", "));
  }

  return lines;
}

function escapeCsvValue(value) {
  const normalized = String(value ?? "");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildAccountRows(accounts, posts) {
  return accounts.map((account) => {
    const username = String(account?.username || "").trim();
    const accountPosts = posts.filter((post) => post.username === username);
    const urls = accountPosts.map((post) => post.url);
    const line = `${username}: ${urls.join(", ")}`;

    return {
      username,
      urls,
      line,
    };
  });
}

function buildCsv(rows) {
  const header = ["username", "post_urls"];
  const body = rows.map((row) => [row.username, row.line]);

  return [header, ...body]
    .map((columns) => columns.map(escapeCsvValue).join(","))
    .join("\n");
}

export async function scanKickCampaignPosts() {
  const accounts = await getAccounts({ campaignSlug: "kick-campaign" });
  const instagramAccounts = accounts.filter(
    (account) => String(account?.platform || "").trim().toLowerCase() === "instagram"
  );
  const cutoffTime = Date.now() - RECENT_WINDOW_MS;
  const collectedPosts = [];
  const errors = [];

  for (const account of instagramAccounts) {
    try {
      await sleep(REQUEST_GAP_MS);
      const recentPosts = await fetchRecentAccountPosts(account?.username, cutoffTime);
      collectedPosts.push(...recentPosts);
    } catch (error) {
      errors.push({
        username: String(account?.username || "").trim(),
        error: error?.message || "Failed to scan account",
      });
    }
  }

  collectedPosts.sort(
    (left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
  );

  const urls = collectedPosts.map((post) => post.url);
  const lines = formatUrlLines(urls);
  const accountRows = buildAccountRows(instagramAccounts, collectedPosts);
  const accountLines = accountRows.map((row) => row.line);
  const csv = buildCsv(accountRows);

  return {
    scannedAccounts: instagramAccounts.length,
    totalNewPosts: urls.length,
    urls,
    lines,
    output: accountLines.join("\n"),
    csv,
    accountRows,
    posts: collectedPosts,
    errors,
    scannedAt: new Date().toISOString(),
  };
}
