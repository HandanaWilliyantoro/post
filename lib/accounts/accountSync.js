import { ensureAccountsCollection } from "@/lib/accounts/campaignAccounts";
import { fetchAllAccounts, serializeAccounts } from "@/lib/accounts/fetchAccounts";
import { buildCampaignFields } from "@/lib/campaignMetadata";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeAccount(account, existing = {}) {
  const campaignSlug = String(existing?.campaignSlug || "").trim();
  const campaignFields = campaignSlug
    ? buildCampaignFields(existing)
    : {
        campaignType: "manual",
        campaignId: "",
        campaignPassword: "",
      };

  return serializeAccounts([{
    ...account,
    username: normalizeUsername(account?.username),
    platform: "instagram",
    niche: String(existing?.niche || account?.niche || "streaming").trim().toLowerCase(),
    campaignSlug,
    status: campaignSlug ? "active" : "idle",
    ...campaignFields,
    syncedAt: new Date().toISOString(),
  }])[0];
}

export async function syncAccountsFromPostOnce() {
  const collection = await ensureAccountsCollection();
  const remoteAccounts = serializeAccounts(await fetchAllAccounts())
    .filter((account) => String(account?.platform || "").trim().toLowerCase() === "instagram")
    .filter((account) => normalizeUsername(account?.username));
  const existingRows = await collection.find({}).project({ _id: 0 }).toArray();
  const existingById = new Map(
    existingRows
      .map((account) => [normalizeId(account?.id), account])
      .filter(([id]) => id)
  );
  const existingByUsername = new Map(
    existingRows.map((account) => [normalizeUsername(account?.username), account])
  );
  const remoteIds = new Set(
    remoteAccounts
      .map((account) => normalizeId(account?.id))
      .filter(Boolean)
  );
  const usernames = new Set(
    remoteAccounts.map((account) => normalizeUsername(account?.username))
  );

  await Promise.all(remoteAccounts.map((account) => {
    const username = normalizeUsername(account?.username);
    const accountId = normalizeId(account?.id);
    const existing =
      existingById.get(accountId) || existingByUsername.get(username) || {};
    const normalized = normalizeAccount(account, existing);

    return collection.updateOne(
      accountId ? { id: accountId } : { username },
      { $set: normalized },
      { upsert: true }
    );
  }));

  await collection.deleteMany({
    $and: [
      {
        $or: [
          { id: { $exists: false } },
          { id: "" },
          { id: { $nin: [...remoteIds] } },
        ],
      },
      { username: { $nin: [...usernames] } },
    ],
  });

  return collection.find({}).project({ _id: 0 }).sort({ username: 1 }).toArray();
}
