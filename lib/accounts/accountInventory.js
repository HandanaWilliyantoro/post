import { getDb } from "@/lib/db";
import { serializeAccounts } from "@/lib/accounts/fetchAccounts";
import { CAMPAIGN_ACCOUNT_COLLECTIONS } from "@/lib/accounts/campaignAccounts";

const SHARED_COLLECTION = "campaignAccounts";

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
  const db = await getDb();
  const collectionNames = [...new Set([...Object.values(CAMPAIGN_ACCOUNT_COLLECTIONS), SHARED_COLLECTION])];
  const groupedRows = await Promise.all(
    collectionNames.map(async (collectionName) => ({
      collectionName,
      rows: await db.collection(collectionName).find({}).project({ _id: 0 }).toArray(),
    }))
  );

  return groupedRows.flatMap(({ collectionName, rows }) =>
    normalizeCollectionRows(rows, {
      storageCollection: collectionName,
    })
  );
}

export async function releaseCampaignAccounts(campaignSlug) {
  const normalizedSlug = String(campaignSlug || "").trim();

  if (!normalizedSlug) {
    return 0;
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const sourceCollectionName =
    CAMPAIGN_ACCOUNT_COLLECTIONS[normalizedSlug] || SHARED_COLLECTION;

  if (sourceCollectionName === SHARED_COLLECTION) {
    const result = await db.collection(SHARED_COLLECTION).updateMany(
      { campaignSlug: normalizedSlug },
      {
        $set: {
          campaignSlug: "",
          status: "idle",
          updated_at: now,
          releasedAt: now,
        },
      }
    );

    return result.modifiedCount;
  }

  const sourceRows = await db
    .collection(sourceCollectionName)
    .find({})
    .project({ _id: 0 })
    .toArray();

  if (!sourceRows.length) {
    return 0;
  }

  const releasedRows = normalizeCollectionRows(sourceRows, {
    campaignSlug: "",
    status: "idle",
    updated_at: now,
    releasedAt: now,
  });

  await Promise.all(
    releasedRows.map((account) =>
      db.collection(SHARED_COLLECTION).updateOne(
        {
          username: account.username,
          campaignSlug: "",
        },
        { $set: account },
        { upsert: true }
      )
    )
  );

  await db.collection(sourceCollectionName).deleteMany({});
  return releasedRows.length;
}
