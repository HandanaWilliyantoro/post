import { getDb } from "@/lib/db";
import { releaseCampaignAccounts } from "@/lib/accounts/accountInventory";
import { clearAccountsCache } from "@/lib/accounts/getAccounts";
import { clearPostsCache } from "@/lib/post/queries/listPosts";

export async function purgeCampaignData(slug) {
  await releaseCampaignAccounts(slug);
  const db = await getDb();

  await db.collection("posts").deleteMany({ campaignSlug: slug });
  clearAccountsCache();
  clearPostsCache();
}
