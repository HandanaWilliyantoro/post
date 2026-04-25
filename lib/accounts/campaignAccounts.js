import { getDb } from "@/lib/db";
import { findCampaignBySlug } from "@/lib/campaigns";
import { buildCampaignFields } from "@/lib/campaignMetadata";
import kickAccounts from "@/lib/accounts/data/kickAccounts";
import {
  fetchAllAccounts,
  filterEligibleAccounts,
  serializeAccounts,
} from "@/lib/accounts/fetchAccounts";

export const ACCOUNTS_COLLECTION = "accounts";
export const LEGACY_ACCOUNT_COLLECTIONS = {
  "kick-campaign": "kickCampaignAccounts",
  "lospollostv-campaign": "lospollostvAccounts",
};

const SHARED_LEGACY_COLLECTION = "campaignAccounts";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSlug(value) {
  return String(value || "").trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAccount(row, overrides = {}) {
  const campaignSlug = normalizeSlug(
    overrides.campaignSlug ?? row?.campaignSlug
  );
  const status = campaignSlug ? "active" : "idle";
  const campaignFields = campaignSlug
    ? buildCampaignFields({
        campaignType: overrides.campaignType ?? row?.campaignType,
        campaignId: overrides.campaignId ?? row?.campaignId,
        campaignPassword: overrides.campaignPassword ?? row?.campaignPassword,
      })
    : {
        campaignType: "manual",
        campaignId: "",
        campaignPassword: "",
      };

  return serializeAccounts([{
    ...row,
    ...overrides,
    id: String(row?.id || overrides.id || crypto.randomUUID()).trim(),
    username: normalizeUsername(row?.username ?? overrides.username),
    platform: "instagram",
    niche: normalizeUsername(overrides.niche ?? row?.niche ?? "streaming"),
    status,
    campaignSlug,
    ...campaignFields,
  }])[0];
}

async function collectionExists(db, name) {
  return db.listCollections({ name }, { nameOnly: true }).hasNext();
}

async function importLegacyRows(db, collectionName, fallbackCampaignSlug) {
  if (!(await collectionExists(db, collectionName))) return 0;
  const rows = await db.collection(collectionName).find({}).project({ _id: 0 }).toArray();

  await Promise.all(rows.map((row) => {
    const campaignSlug = normalizeSlug(row?.campaignSlug || fallbackCampaignSlug);
    const account = normalizeAccount(row, { campaignSlug });

    return db.collection(ACCOUNTS_COLLECTION).updateOne(
      { username: account.username },
      { $set: account },
      { upsert: true }
    );
  }));

  await db.collection(collectionName).drop();
  return rows.length;
}

export async function ensureAccountsCollection() {
  const db = await getDb();
  const collection = db.collection(ACCOUNTS_COLLECTION);
  await collection.createIndex({ username: 1 });
  await collection.createIndex({ campaignSlug: 1 });

  await Promise.all([
    importLegacyRows(db, SHARED_LEGACY_COLLECTION, ""),
    ...Object.entries(LEGACY_ACCOUNT_COLLECTIONS).map(([slug, collectionName]) =>
      importLegacyRows(db, collectionName, slug)
    ),
  ]);

  await Promise.all([
    collection.updateMany({ campaignSlug: { $nin: ["", null] } }, { $set: { status: "active" } }),
    collection.updateMany(
      { $or: [{ campaignSlug: "" }, { campaignSlug: null }, { campaignSlug: { $exists: false } }] },
      {
        $set: {
          campaignSlug: "",
          status: "idle",
          campaignType: "manual",
          campaignId: "",
          campaignPassword: "",
        },
      }
    ),
  ]);

  return collection;
}

export function splitCampaignAccounts(accounts) {
  const eligibleAccounts = filterEligibleAccounts(accounts);
  const kickUsernames = new Set(kickAccounts.map(normalizeUsername));

  return eligibleAccounts.reduce((result, account) => {
    const username = normalizeUsername(account.username);
    const key = kickUsernames.has(username) ? "kickCampaignAccounts" : "lospollostvAccounts";
    result[key].push(account);
    return result;
  }, { kickCampaignAccounts: [], lospollostvAccounts: [] });
}

export async function listAllLocalAccounts() {
  const collection = await ensureAccountsCollection();
  return collection.find({}).project({ _id: 0 }).sort({ username: 1 }).toArray().then(serializeAccounts);
}

export async function listLocalAccountsPage(options = {}) {
  const collection = await ensureAccountsCollection();
  const requestedPage = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Number(options.pageSize || 10));
  const queryText = String(options.queryText || "").trim();
  const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
  const query = regex
    ? {
        $or: [
          { username: regex },
          { platform: regex },
          { niche: regex },
          { status: regex },
          { campaignSlug: regex },
          { id: regex },
        ],
      }
    : {};

  const totalItems = await collection.countDocuments(query);
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(totalItems / pageSize))
  );
  const items = await collection
    .find(query)
    .project({ _id: 0 })
    .sort({ username: 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray()
    .then(serializeAccounts);

  return {
    items,
    page,
    pageSize,
    totalItems,
  };
}

export async function listIdleAccounts() {
  const collection = await ensureAccountsCollection();
  return collection.find({ campaignSlug: "" }).project({ _id: 0 }).sort({ username: 1 }).toArray().then(serializeAccounts);
}

export async function getCampaignAccounts(campaignSlug) {
  const collection = await ensureAccountsCollection();
  const slug = normalizeSlug(campaignSlug);

  return collection
    .find({ campaignSlug: slug })
    .project({ _id: 0 })
    .sort({ username: 1 })
    .toArray()
    .then(serializeAccounts);
}

export async function getCampaignAccountsPage(campaignSlug, options = {}) {
  const collection = await ensureAccountsCollection();
  const slug = normalizeSlug(campaignSlug);
  const requestedPage = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Number(options.pageSize || 10));
  const queryText = String(options.queryText || "").trim();
  const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
  const query = {
    campaignSlug: slug,
    ...(regex
      ? {
          $or: [
            { username: regex },
            { platform: regex },
            { niche: regex },
            { status: regex },
            { id: regex },
          ],
        }
      : {}),
  };

  const totalItems = await collection.countDocuments(query);
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(totalItems / pageSize))
  );
  const items = await collection
    .find(query)
    .project({ _id: 0 })
    .sort({ username: 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray()
    .then(serializeAccounts);

  return {
    items,
    page,
    pageSize,
    totalItems,
  };
}

export async function getAllCampaignAccountAssignments() {
  const collection = await ensureAccountsCollection();
  const rows = await collection
    .find({ campaignSlug: { $nin: ["", null] } })
    .project({ _id: 0, username: 1, campaignSlug: 1 })
    .toArray();

  return rows.map((row) => ({
    username: normalizeUsername(row?.username),
    campaignSlug: normalizeSlug(row?.campaignSlug),
  })).filter((row) => row.username && row.campaignSlug);
}

export async function createCampaignAccount(campaignSlug, input) {
  const username = normalizeUsername(input.username);
  const accountId = String(input.accountId || input.id || "").trim();
  if (!username && !accountId) throw new Error("Account is required");

  const campaign = campaignSlug ? await findCampaignBySlug(campaignSlug) : null;
  if (campaignSlug && !campaign) throw new Error("Campaign not found");
  if (!campaignSlug) throw new Error("campaignSlug is required");

  const collection = await ensureAccountsCollection();
  const query = accountId ? { id: accountId } : { username };
  const existingAccount = await collection.findOne(query, { projection: { _id: 0 } });
  if (!existingAccount) throw new Error("Account not found");
  if (existingAccount.campaignSlug) throw new Error("Account is already assigned");

  const now = new Date().toISOString();
  const account = normalizeAccount(existingAccount, {
    niche: campaign?.niche || input.niche || "streaming",
    campaignSlug,
    campaignType: campaign?.campaignType,
    campaignId: campaign?.campaignId,
    campaignPassword: campaign?.campaignPassword,
    updated_at: now,
  });

  await collection.updateOne(query, { $set: account });
  return account;
}

export async function releaseCampaignAccount(input = {}) {
  const username = normalizeUsername(input.username);
  const accountId = String(input.accountId || input.id || "").trim();

  if (!username && !accountId) {
    throw new Error("Account is required");
  }

  const collection = await ensureAccountsCollection();
  const query = accountId ? { id: accountId } : { username };
  const existingAccount = await collection.findOne(query, { projection: { _id: 0 } });

  if (!existingAccount) {
    throw new Error("Account not found");
  }

  const remoteAccounts = serializeAccounts(await fetchAllAccounts());
  const restoredAccount =
    remoteAccounts.find((account) => String(account?.id || "").trim() === accountId) ||
    remoteAccounts.find(
      (account) =>
        normalizeUsername(account?.username) === normalizeUsername(existingAccount?.username)
    ) ||
    existingAccount;

  const now = new Date().toISOString();
  const account = normalizeAccount(restoredAccount, {
    id: existingAccount.id,
    username: existingAccount.username,
    campaignSlug: "",
    status: "idle",
    campaignType: "manual",
    campaignId: "",
    campaignPassword: "",
    updated_at: now,
    releasedAt: now,
  });

  await collection.updateOne(query, { $set: account });
  return account;
}

export async function seedCampaignAccounts() {
  const sourceAccounts = await fetchAllAccounts();
  const { kickCampaignAccounts, lospollostvAccounts } = splitCampaignAccounts(sourceAccounts);
  const collection = await ensureAccountsCollection();
  const seededAt = new Date().toISOString();
  await collection.deleteMany({});

  const rows = [
    ...lospollostvAccounts.map((account) => normalizeAccount(account, {
      campaignSlug: "lospollostv-campaign",
      seededAt,
    })),
    ...kickCampaignAccounts.map((account) => normalizeAccount(account, {
      campaignSlug: "kick-campaign",
      seededAt,
    })),
  ];

  if (rows.length) await collection.insertMany(rows);

  return {
    totalFetched: sourceAccounts.length,
    totalEligible: rows.length,
    lospollostvAccounts: lospollostvAccounts.length,
    kickCampaignAccounts: kickCampaignAccounts.length,
    excludedKickUsernames: [...kickAccounts],
  };
}
