import { getDb } from "@/lib/db";
import { releaseCampaignAccounts } from "@/lib/accounts/accountInventory";
import postonceClient from "@/lib/api/postonceClient";
import { clearAccountsCache } from "@/lib/accounts/getAccounts";
import { clearPostsCache, ensurePostsCollection } from "@/lib/post/queries/listPosts";

export async function purgeCampaignData(slug) {
  await releaseCampaignAccounts(slug);
  const db = await getDb();
  const postsCollection = await ensurePostsCollection();
  const posts = await postsCollection
    .find({ campaignSlug: slug })
    .project({ _id: 0, id: 1 })
    .toArray();

  await Promise.allSettled(
    posts
      .map((post) => String(post?.id || "").trim())
      .filter(Boolean)
      .map((postId) => postonceClient.delete(`/posts/${postId}`))
  );

  await db.collection("posts").deleteMany({ campaignSlug: slug });
  clearAccountsCache();
  clearPostsCache();
}
