import { serializeAccounts } from "@/lib/accounts/fetchAccounts";
import { ACCOUNTS_COLLECTION, ensureAccountsCollection } from "@/lib/accounts/campaignAccounts";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCollectionRows(rows, overrides = {}) {
  return serializeAccounts(rows).map((row) => ({
    ...row,
    ...overrides,
    username: normalizeUsername(row?.username),
  }));
}

export async function listManagedAccounts() {
  const collection = await ensureAccountsCollection();
  const rows = await collection.find({}).project({ _id: 0 }).toArray();

  return normalizeCollectionRows(rows, { storageCollection: ACCOUNTS_COLLECTION });
}

export async function releaseCampaignAccounts(campaignSlug) {
  const normalizedSlug = String(campaignSlug || "").trim();

  if (!normalizedSlug) {
    return 0;
  }

  const collection = await ensureAccountsCollection();
  const now = new Date().toISOString();
  const result = await collection.updateMany(
    { campaignSlug: normalizedSlug },
    { $set: { campaignSlug: "", status: "idle", updated_at: now, releasedAt: now } }
  );

  return result.modifiedCount;
}
