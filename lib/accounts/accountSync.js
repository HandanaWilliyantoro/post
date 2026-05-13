import { ensureAccountsCollection } from "@/lib/accounts/campaignAccounts";
import {
  fetchAllAccounts,
  filterEligibleAccounts,
  serializeAccounts,
} from "@/lib/accounts/fetchAccounts";
import {
  isSupportedSeedAccountPlatform,
  normalizeAccountPlatform,
} from "@/lib/accounts/platforms";
import {
  normalizeAccountStatus,
  resolveAssignmentStatus,
} from "@/lib/accounts/status";
import { buildCampaignFields } from "@/lib/campaignMetadata";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeId(value) {
  return String(value || "").trim();
}

function buildPlatformUsernameKey(account) {
  const username = normalizeUsername(account?.username);
  const platform = normalizeAccountPlatform(account?.platform, "");

  if (!username || !platform) {
    return "";
  }

  return `${platform}:${username}`;
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
    platform: normalizeAccountPlatform(account?.platform || existing?.platform),
    niche: String(existing?.niche || account?.niche || "streaming").trim().toLowerCase(),
    campaignSlug,
    status: normalizeAccountStatus(account?.status || existing?.status),
    assignmentStatus: resolveAssignmentStatus(campaignSlug),
    ...campaignFields,
    syncedAt: new Date().toISOString(),
  }])[0];
}

export async function syncAccountsFromPostOnce() {
  const collection = await ensureAccountsCollection();
  const remoteAccounts = serializeAccounts(
    filterEligibleAccounts(await fetchAllAccounts())
  )
    .filter((account) => isSupportedSeedAccountPlatform(account?.platform))
    .filter((account) => normalizeUsername(account?.username));
  const existingRows = await collection.find({}).toArray();
  const existingById = new Map(
    existingRows
      .map((account) => [normalizeId(account?.id), account])
      .filter(([id]) => id)
  );
  const existingByPlatformUsername = new Map(
    existingRows
      .map((account) => [buildPlatformUsernameKey(account), account])
      .filter(([key]) => key)
  );
  const remoteIds = new Set(
    remoteAccounts
      .map((account) => normalizeId(account?.id))
      .filter(Boolean)
  );
  const remoteAccountKeys = new Set(
    remoteAccounts
      .map((account) => buildPlatformUsernameKey(account))
      .filter(Boolean)
  );

  await Promise.all(remoteAccounts.map((account) => {
    const username = normalizeUsername(account?.username);
    const accountId = normalizeId(account?.id);
    const platform = normalizeAccountPlatform(account?.platform);
    const existing =
      existingById.get(accountId) ||
      existingByPlatformUsername.get(buildPlatformUsernameKey(account)) ||
      {};
    const normalized = normalizeAccount(account, existing);

    return collection.updateOne(
      accountId ? { id: accountId } : { username, platform },
      { $set: normalized },
      { upsert: true }
    );
  }));

  const staleRowIds = existingRows
    .filter((account) => {
      const accountId = normalizeId(account?.id);
      const accountKey = buildPlatformUsernameKey(account);

      if (accountId && remoteIds.has(accountId)) {
        return false;
      }

      return !accountKey || !remoteAccountKeys.has(accountKey);
    })
    .map((account) => account?._id)
    .filter(Boolean);

  if (staleRowIds.length) {
    await collection.deleteMany({ _id: { $in: staleRowIds } });
  }

  return collection.find({}).project({ _id: 0 }).sort({ username: 1 }).toArray();
}
