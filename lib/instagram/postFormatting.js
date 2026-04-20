import { MAX_URLS_PER_LINE } from "@/lib/instagram/constants";

export function getNodeUrl(node) {
  const shortcode = String(node?.shortcode || "").trim();
  return shortcode ? `https://www.instagram.com/p/${shortcode}/` : "";
}

export function isRecentNode(node, cutoffTime) {
  const timestampSeconds = Number(node?.taken_at_timestamp || 0);
  return Boolean(timestampSeconds) && timestampSeconds * 1000 >= cutoffTime;
}

export function mapEdgesToRecentPosts(edges, username, cutoffTime) {
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

export function formatUrlLines(urls) {
  const lines = [];
  for (let index = 0; index < urls.length; index += MAX_URLS_PER_LINE) {
    lines.push(urls.slice(index, index + MAX_URLS_PER_LINE).join(", "));
  }
  return lines;
}

export function buildAccountRows(accounts, posts) {
  return accounts.map((account) => {
    const username = String(account?.username || "").trim();
    const urls = posts.filter((post) => post.username === username).map((post) => post.url);
    return { username, urls, line: `${username}: ${urls.join(", ")}` };
  });
}

export function buildCsv(rows) {
  const escapeCsvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [["username", "post_urls"], ...rows.map((row) => [row.username, row.line])]
    .map((columns) => columns.map(escapeCsvValue).join(","))
    .join("\n");
}
