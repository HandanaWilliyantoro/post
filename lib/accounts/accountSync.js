import { ensureAccountsCollection } from "@/lib/accounts/campaignAccounts";
import { fetchAllAccounts, serializeAccounts } from "@/lib/accounts/fetchAccounts";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAccount(account, existing = {}) {
  const campaignSlug = String(existing?.campaignSlug || "").trim();
  return serializeAccounts([{
    ...account,
    username: normalizeUsername(account?.username),
    platform: "instagram",
    niche: String(existing?.niche || account?.niche || "streaming").trim().toLowerCase(),
    campaignSlug,
    status: campaignSlug ? "active" : "idle",
    syncedAt: new Date().toISOString(),
  }])[0];
}

export async function syncAccountsFromPostOnce() {
  const collection = await ensureAccountsCollection();
  const remoteAccounts = serializeAccounts(await fetchAllAccounts())
    .filter((account) => String(account?.platform || "").trim().toLowerCase() === "instagram")
    .filter((account) => normalizeUsername(account?.username));
  const existingRows = await collection.find({}).project({ _id: 0 }).toArray();
  const existingByUsername = new Map(
    existingRows.map((account) => [normalizeUsername(account?.username), account])
  );
  const usernames = remoteAccounts.map((account) => normalizeUsername(account?.username));

  await Promise.all(remoteAccounts.map((account) => {
    const username = normalizeUsername(account?.username);
    const normalized = normalizeAccount(account, existingByUsername.get(username));
    return collection.updateOne({ username }, { $set: normalized }, { upsert: true });
  }));

  await collection.deleteMany({ username: { $nin: usernames } });
  return collection.find({}).project({ _id: 0 }).sort({ username: 1 }).toArray();
}
