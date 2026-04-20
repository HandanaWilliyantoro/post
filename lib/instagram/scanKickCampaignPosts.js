import { getAccounts } from "@/lib/accounts/getAccounts";
import { RECENT_WINDOW_MS, REQUEST_GAP_MS } from "@/lib/instagram/constants";
import { buildAccountRows, buildCsv, formatUrlLines } from "@/lib/instagram/postFormatting";
import { fetchRecentAccountPosts, sleep } from "@/lib/instagram/profileLookup";

export async function scanKickCampaignPosts() {
  const accounts = await getAccounts({ campaignSlug: "kick-campaign" });
  const instagramAccounts = accounts.filter((account) => String(account?.platform || "").trim().toLowerCase() === "instagram");
  const cutoffTime = Date.now() - RECENT_WINDOW_MS;
  const collectedPosts = [];
  const errors = [];

  for (const account of instagramAccounts) {
    try {
      await sleep(REQUEST_GAP_MS);
      collectedPosts.push(...(await fetchRecentAccountPosts(account?.username, cutoffTime)));
    } catch (error) {
      errors.push({ username: String(account?.username || "").trim(), error: error?.message || "Failed to scan account" });
    }
  }

  collectedPosts.sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());

  const urls = collectedPosts.map((post) => post.url);
  const accountRows = buildAccountRows(instagramAccounts, collectedPosts);

  return {
    scannedAccounts: instagramAccounts.length,
    totalNewPosts: urls.length,
    urls,
    lines: formatUrlLines(urls),
    output: accountRows.map((row) => row.line).join("\n"),
    csv: buildCsv(accountRows),
    accountRows,
    posts: collectedPosts,
    errors,
    scannedAt: new Date().toISOString(),
  };
}
