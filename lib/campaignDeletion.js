import { getDb } from "@/lib/db";
import { releaseCampaignAccounts } from "@/lib/accounts/accountInventory";
import { clearAccountsCache } from "@/lib/accounts/getAccounts";
import { clearPostsCache, ensurePostsCollection } from "@/lib/post/queries/listPosts";

const DELETED_COLLECTION = "deletedCampaigns";

export async function ensureDeletedCampaignsCollection() {
  const db = await getDb();
  const collections = await db
    .listCollections({ name: DELETED_COLLECTION }, { nameOnly: true })
    .toArray();

  if (!collections.length) {
    await db.createCollection(DELETED_COLLECTION);
  }

  const collection = db.collection(DELETED_COLLECTION);
  await collection.createIndex({ slug: 1 }, { unique: true });
  return collection;
}

export async function listDeletedCampaignSlugs() {
  const collection = await ensureDeletedCampaignsCollection();
  const rows = await collection.find({}).project({ _id: 0, slug: 1 }).toArray();
  return new Set(rows.map((row) => String(row.slug || "").trim()).filter(Boolean));
}

export async function markCampaignDeleted(slug) {
  const collection = await ensureDeletedCampaignsCollection();
  await collection.updateOne(
    { slug },
    { $set: { slug, deletedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

export async function purgeCampaignData(slug) {
  await releaseCampaignAccounts(slug);
  const db = await getDb();
  await (await ensurePostsCollection()).deleteMany({ campaignSlug: slug });
  clearAccountsCache();
  clearPostsCache();
}
