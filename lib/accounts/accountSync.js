import {
  ensureAccountsCollection,
  normalizeCampaignSlugs,
} from "@/lib/accounts/campaignAccounts";
import {
  fetchAllAccounts,
  filterEligibleAccounts,
  serializeAccounts,
} from "@/lib/accounts/fetchAccounts";
import {
  isSupportedSeedAccountPlatform,
  normalizeAccountPlatform,
} from "@/lib/accounts/platforms";
import { parseCampaignSlugFromExternalId } from "@/lib/accounts/providerExternalId";
import {
  normalizeAccountStatus,
  resolveAssignmentStatus,
} from "@/lib/accounts/status";
import { buildCampaignFields } from "@/lib/campaignMetadata";

const DEFAULT_PROVIDER_SYNC_TTL_MS = Math.max(
  0,
  Number(process.env.POSTFORME_ACCOUNT_SYNC_TTL_MS || 60 * 1000) || 60 * 1000
);
const PROVIDER_SYNC_FAILURE_BACKOFF_MS = Math.max(
  0,
  Number(process.env.POSTFORME_ACCOUNT_SYNC_FAILURE_BACKOFF_MS || 30 * 1000) ||
    30 * 1000
);
const DEFAULT_PROVIDER_SYNC_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.POSTFORME_ACCOUNT_SYNC_TIMEOUT_MS || 12 * 1000) ||
    12 * 1000
);

let lastProviderSyncAt = 0;
let lastProviderSyncFailureAt = 0;
let providerSyncPromise = null;

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
  const existingCampaignSlugs = normalizeCampaignSlugs(
    existing?.campaignSlugs,
    existing?.campaignSlug
  );
  const externalId = normalizeId(account?.external_id);
  const releasedConnectionExternalId = normalizeId(
    existing?.releasedConnectionExternalId
  );
  const isReleasedConnection =
    externalId && externalId === releasedConnectionExternalId;
  const connectedCampaignSlug = isReleasedConnection
    ? ""
    : parseCampaignSlugFromExternalId(externalId);
  const campaignSlugs = existingCampaignSlugs.length
    ? existingCampaignSlugs
    : normalizeCampaignSlugs([], connectedCampaignSlug);
  const campaignSlug = campaignSlugs[0] || "";
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
    campaignSlugs,
    status: normalizeAccountStatus(account?.status || existing?.status),
    assignmentStatus: resolveAssignmentStatus(campaignSlugs),
    ...campaignFields,
    releasedConnectionExternalId: isReleasedConnection
      ? releasedConnectionExternalId
      : "",
    syncedAt: new Date().toISOString(),
  }])[0];
}

async function listStoredAccounts(collection) {
  return collection.find({}).project({ _id: 0 }).sort({ username: 1 }).toArray();
}

function shouldUseStoredAccounts(options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();
  const maxAgeMs = Math.max(
    0,
    Number(options.maxAgeMs ?? DEFAULT_PROVIDER_SYNC_TTL_MS) ||
      DEFAULT_PROVIDER_SYNC_TTL_MS
  );

  if (force) {
    return false;
  }

  if (lastProviderSyncAt && now - lastProviderSyncAt < maxAgeMs) {
    return true;
  }

  return (
    lastProviderSyncFailureAt &&
    now - lastProviderSyncFailureAt < PROVIDER_SYNC_FAILURE_BACKOFF_MS
  );
}

function createTimeoutSignal(timeoutMs) {
  const ms = Math.max(
    0,
    Number(timeoutMs ?? DEFAULT_PROVIDER_SYNC_TIMEOUT_MS) ||
      DEFAULT_PROVIDER_SYNC_TIMEOUT_MS
  );

  if (!ms || typeof AbortController === "undefined") {
    return {
      signal: undefined,
      clear: () => {},
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

export async function syncAccountsFromPostForMe(options = {}) {
  const collection = await ensureAccountsCollection();

  if (shouldUseStoredAccounts(options)) {
    return listStoredAccounts(collection);
  }

  if (providerSyncPromise) {
    return providerSyncPromise;
  }

  const timeout = createTimeoutSignal(options.timeoutMs);
  const signal = options.signal || timeout.signal;

  providerSyncPromise = syncAccountsFromPostForMeRemote(collection, { signal })
    .then((accounts) => {
      lastProviderSyncAt = Date.now();
      lastProviderSyncFailureAt = 0;
      return accounts;
    })
    .catch((error) => {
      lastProviderSyncFailureAt = Date.now();
      throw error;
    })
    .finally(() => {
      timeout.clear();
      providerSyncPromise = null;
    });

  return providerSyncPromise;
}

async function syncAccountsFromPostForMeRemote(collection, options = {}) {
  const remoteAccounts = serializeAccounts(
    filterEligibleAccounts(await fetchAllAccounts({ signal: options.signal }))
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
    await collection.updateMany(
      { _id: { $in: staleRowIds } },
      {
        $set: {
          status: "disconnected",
          providerStatus: "missing",
          assignmentStatus: "idle",
          campaignSlug: "",
          campaignSlugs: [],
          syncedAt: new Date().toISOString(),
        },
      }
    );
  }

  return listStoredAccounts(collection);
}

export async function syncAccountsFromProvider(options = {}) {
  return syncAccountsFromPostForMe(options);
}
