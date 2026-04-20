import { INSTAGRAM_APP_ID, INSTAGRAM_ASBD_ID } from "@/lib/instagram/constants";
import { mapEdgesToRecentPosts } from "@/lib/instagram/postFormatting";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createInstagramHeaders(username) {
  return {
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `https://www.instagram.com/${username}/`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "X-ASBD-ID": INSTAGRAM_ASBD_ID,
    "X-IG-App-ID": INSTAGRAM_APP_ID,
    "X-Requested-With": "XMLHttpRequest",
  };
}

export function normalizeEdges(payload) {
  return payload?.data?.user?.edge_owner_to_timeline_media?.edges || payload?.graphql?.user?.edge_owner_to_timeline_media?.edges || payload?.data?.user?.timeline_media?.edges || [];
}

function tryParseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function extractSharedDataFromHtml(html) {
  for (const pattern of [/window\._sharedData\s*=\s*(\{[\s\S]*?\})\s*;/, /"edge_owner_to_timeline_media":\s*(\{[\s\S]*?"page_info":\{[\s\S]*?\}\})/]) {
    const parsed = tryParseJson(html.match(pattern)?.[1]);
    if (parsed) return parsed;
  }

  const userId = html.match(/"profilePage_([0-9]+)"/)?.[1];
  const timeline = tryParseJson(html.match(/"edge_owner_to_timeline_media":\s*(\{[\s\S]*?"page_info":\{[\s\S]*?\}\})/)?.[1]);
  return userId && timeline ? { graphql: { user: { id: userId, edge_owner_to_timeline_media: timeline } } } : null;
}

async function fetchRecentPostsFromHtml(username, cutoffTime, headers) {
  const response = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    headers: { ...headers, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${response.status} https://www.instagram.com/${username}/`);
  const edges = normalizeEdges(extractSharedDataFromHtml(await response.text()));
  if (!edges.length) throw new Error(`No timeline data found in https://www.instagram.com/${username}/`);
  return mapEdgesToRecentPosts(edges, username, cutoffTime);
}

export async function fetchRecentAccountPosts(username, cutoffTime) {
  const normalizedUsername = String(username || "").trim().replace(/^@/, "");
  if (!normalizedUsername) return [];

  const headers = createInstagramHeaders(normalizedUsername);
  const failures = [];
  let posts = [];

  for (const endpoint of [
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(normalizedUsername)}`,
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(normalizedUsername)}`,
    `https://www.instagram.com/${encodeURIComponent(normalizedUsername)}/?__a=1&__d=dis`,
  ]) {
    try {
      const response = await fetch(endpoint, { headers, cache: "no-store" });
      if (!response.ok) {
        failures.push(`${response.status} ${endpoint}`);
        continue;
      }
      posts = mapEdgesToRecentPosts(normalizeEdges(await response.json()), normalizedUsername, cutoffTime);
      if (posts.length) break;
    } catch (error) {
      failures.push(`${error?.message || "request failed"} ${endpoint}`);
    }
  }

  if (!posts.length) {
    try { posts = await fetchRecentPostsFromHtml(normalizedUsername, cutoffTime, headers); }
    catch (error) { failures.push(error?.message || `https://www.instagram.com/${normalizedUsername}/`); }
  }

  if (!posts.length) {
    throw new Error(`Instagram lookup failed for ${normalizedUsername}${failures.length ? ` (${failures.join(" | ")})` : ""}`);
  }

  return posts;
}
