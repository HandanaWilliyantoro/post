import { serializeAccounts } from "@/lib/accounts/fetchAccounts";
import {
  ACCOUNTS_COLLECTION,
  ensureAccountsCollection,
} from "@/lib/accounts/campaignAccounts";
import { ACTIVE_ACCOUNT_STATUS, resolveAssignmentStatus } from "@/lib/accounts/status";

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
  const rows = await collection
    .find({
      $or: [{ campaignSlugs: normalizedSlug }, { campaignSlug: normalizedSlug }],
    })
    .project({ _id: 1, campaignSlug: 1, campaignSlugs: 1 })
    .toArray();

  await Promise.all(
    rows.map((row) => {
      return collection.updateOne(
        { _id: row._id },
        {
          $set: {
            campaignSlug: "",
            campaignSlugs: [],
            status: ACTIVE_ACCOUNT_STATUS,
            assignmentStatus: resolveAssignmentStatus(""),
            campaignType: "manual",
            campaignId: "",
            campaignPassword: "",
            updated_at: now,
            releasedAt: now,
          },
        }
      );
    })
  );

  return rows.length;
}
