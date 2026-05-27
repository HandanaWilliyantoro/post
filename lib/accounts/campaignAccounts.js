import { getDb } from "@/lib/db";
import { findCampaignBySlug } from "@/lib/campaigns";
import { buildCampaignFields } from "@/lib/campaignMetadata";
import kickAccounts from "@/lib/accounts/data/kickAccounts";
import {
  fetchAllAccounts,
  filterEligibleAccounts,
  serializeAccounts,
} from "@/lib/accounts/fetchAccounts";
import { normalizeAccountPlatform } from "@/lib/accounts/platforms";
import {
  ACTIVE_ACCOUNT_STATUS,
  normalizeAccountStatus,
  resolveAssignmentStatus,
} from "@/lib/accounts/status";

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

export function normalizeCampaignSlugs(value, fallbackSlug = "") {
  const slugs = [
    ...(Array.isArray(value) ? value : value ? [value] : []),
    fallbackSlug,
  ]
    .map(normalizeSlug)
    .filter(Boolean);

  return [...new Set(slugs)].slice(0, 1);
}

function getPrimaryCampaignSlug(campaignSlugs) {
  return normalizeCampaignSlugs(campaignSlugs)[0] || "";
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildUsernamePlatformQuery(input = {}) {
  const username = normalizeUsername(input?.username);
  const platform = normalizeAccountPlatform(input?.platform, "");

  if (!username) {
    return null;
  }

  if (!platform) {
    return { username };
  }

  return {
    username,
    platform,
  };
}

function normalizeAccount(row, overrides = {}) {
  const campaignSlugs = normalizeCampaignSlugs(
    overrides.campaignSlugs ?? row?.campaignSlugs,
    overrides.campaignSlug ?? row?.campaignSlug
  );
  const campaignSlug = getPrimaryCampaignSlug(campaignSlugs);
  const campaignFields = campaignSlug
    ? buildCampaignFields({
        campaignType: overrides.campaignType ?? row?.campaignType,
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
    platform: normalizeAccountPlatform(overrides.platform || row?.platform),
    niche: normalizeUsername(overrides.niche ?? row?.niche ?? "streaming"),
    status: normalizeAccountStatus(overrides.status ?? row?.status),
    assignmentStatus:
      overrides.assignmentStatus ?? resolveAssignmentStatus(campaignSlugs),
    campaignSlug,
    campaignSlugs,
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
      buildUsernamePlatformQuery(account),
      { $set: account },
      { upsert: true }
    );
  }));

  await db.collection(collectionName).drop();
  return rows.length;
}

async function migrateCampaignSlugArrays(collection) {
  const rows = await collection
    .find({})
    .project({ _id: 1, campaignSlug: 1, campaignSlugs: 1, assignmentStatus: 1 })
    .toArray();

  await Promise.all(
    rows.map((row) => {
      const campaignSlugs = normalizeCampaignSlugs(
        row?.campaignSlugs,
        row?.campaignSlug
      );
      const campaignSlug = getPrimaryCampaignSlug(campaignSlugs);
      const assignmentStatus = resolveAssignmentStatus(campaignSlugs);

      if (
        Array.isArray(row?.campaignSlugs) &&
        row.campaignSlugs.length === campaignSlugs.length &&
        row.campaignSlugs.every((slug, index) => slug === campaignSlugs[index]) &&
        normalizeSlug(row?.campaignSlug) === campaignSlug &&
        row?.assignmentStatus === assignmentStatus
      ) {
        return Promise.resolve();
      }

      return collection.updateOne(
        { _id: row._id },
        {
          $set: {
            campaignSlug,
            campaignSlugs,
            assignmentStatus,
            ...(campaignSlugs.length
              ? { status: ACTIVE_ACCOUNT_STATUS }
              : {
                  campaignType: "manual",
                  campaignId: "",
                  campaignPassword: "",
                }),
          },
        }
      );
    })
  );
}

export async function ensureAccountsCollection() {
  const db = await getDb();
  const collection = db.collection(ACCOUNTS_COLLECTION);
  await collection.createIndex({ username: 1 });
  await collection.createIndex({ platform: 1, username: 1 });
  await collection.createIndex({ campaignSlug: 1 });
  await collection.createIndex({ campaignSlugs: 1 });

  await Promise.all([
    importLegacyRows(db, SHARED_LEGACY_COLLECTION, ""),
    ...Object.entries(LEGACY_ACCOUNT_COLLECTIONS).map(([slug, collectionName]) =>
      importLegacyRows(db, collectionName, slug)
    ),
  ]);

  await migrateCampaignSlugArrays(collection);

  await Promise.all([
    collection.updateMany(
      {
        campaignSlugs: { $exists: true, $ne: [] },
        assignmentStatus: { $exists: false },
      },
      {
        $set: {
          status: ACTIVE_ACCOUNT_STATUS,
          assignmentStatus: "assigned",
        },
      }
    ),
    collection.updateMany(
      {
        $or: [
          { campaignSlugs: [] },
          { campaignSlugs: { $exists: false } },
        ],
        assignmentStatus: { $exists: false },
      },
      {
        $set: {
          campaignSlug: "",
          campaignSlugs: [],
          status: ACTIVE_ACCOUNT_STATUS,
          assignmentStatus: "idle",
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

function buildCampaignMembershipQuery(slug) {
  return {
    $or: [{ campaignSlugs: slug }, { campaignSlug: slug }],
  };
}

function buildUnassignedAccountQuery() {
  return {
    $and: [
      {
        $or: [
          { campaignSlug: "" },
          { campaignSlug: null },
          { campaignSlug: { $exists: false } },
        ],
      },
      {
        $or: [
          { campaignSlugs: [] },
          { campaignSlugs: { $exists: false } },
        ],
      },
    ],
  };
}

async function getCampaignOverrides(campaignSlug) {
  const campaign = await findCampaignBySlug(campaignSlug);

  return campaign
    ? {
        campaignType: campaign.campaignType,
      }
    : {};
}

function normalizeAccounts(rows, overrides = {}) {
  return rows.map((row) => normalizeAccount(row, overrides));
}

export async function listAllLocalAccounts() {
  const collection = await ensureAccountsCollection();
  return collection
    .find({ status: ACTIVE_ACCOUNT_STATUS })
    .project({ _id: 0 })
    .sort({ username: 1 })
    .toArray()
    .then((rows) => normalizeAccounts(rows));
}

export async function listLocalAccountsPage(options = {}) {
  const collection = await ensureAccountsCollection();
  const requestedPage = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Number(options.pageSize || 10));
  const queryText = String(options.queryText || "").trim();
  const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
  const query = {
    status: ACTIVE_ACCOUNT_STATUS,
    ...(regex
      ? {
          $or: [
            { username: regex },
            { platform: regex },
            { niche: regex },
            { status: regex },
            { assignmentStatus: regex },
            { campaignSlug: regex },
            { campaignSlugs: regex },
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
    .then((rows) => normalizeAccounts(rows));

  return {
    items,
    page,
    pageSize,
    totalItems,
  };
}

export async function listIdleAccounts() {
  const collection = await ensureAccountsCollection();
  return collection
    .find({ ...buildUnassignedAccountQuery(), status: ACTIVE_ACCOUNT_STATUS })
    .project({ _id: 0 })
    .sort({ username: 1 })
    .toArray()
    .then((rows) => normalizeAccounts(rows));
}

export async function listAssignableAccounts(campaignSlug) {
  const collection = await ensureAccountsCollection();
  const slug = normalizeSlug(campaignSlug);

  if (!slug) {
    return [];
  }

  return collection
    .find({
      status: ACTIVE_ACCOUNT_STATUS,
      ...buildUnassignedAccountQuery(),
    })
    .project({ _id: 0 })
    .sort({ username: 1 })
    .toArray()
    .then((rows) => normalizeAccounts(rows));
}

export async function getCampaignAccounts(campaignSlug) {
  const collection = await ensureAccountsCollection();
  const slug = normalizeSlug(campaignSlug);
  const campaignOverrides = await getCampaignOverrides(slug);

  return collection
    .find({ ...buildCampaignMembershipQuery(slug), status: ACTIVE_ACCOUNT_STATUS })
    .project({ _id: 0 })
    .sort({ username: 1 })
    .toArray()
    .then((rows) => normalizeAccounts(rows, campaignOverrides));
}

export async function getCampaignAccountsPage(campaignSlug, options = {}) {
  const collection = await ensureAccountsCollection();
  const slug = normalizeSlug(campaignSlug);
  const campaignOverrides = await getCampaignOverrides(slug);
  const requestedPage = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Number(options.pageSize || 10));
  const queryText = String(options.queryText || "").trim();
  const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
  const query = {
    status: ACTIVE_ACCOUNT_STATUS,
    $and: [
      buildCampaignMembershipQuery(slug),
      ...(regex
        ? [
            {
              $or: [
                { username: regex },
                { platform: regex },
                { niche: regex },
                { status: regex },
                { assignmentStatus: regex },
                { campaignSlug: regex },
                { campaignSlugs: regex },
                { id: regex },
              ],
            },
          ]
        : []),
    ],
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
    .then((rows) => normalizeAccounts(rows, campaignOverrides));

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
    .find({
      status: ACTIVE_ACCOUNT_STATUS,
      $or: [
        { campaignSlugs: { $exists: true, $ne: [] } },
        { campaignSlug: { $nin: ["", null] } },
      ],
    })
    .project({ _id: 0, username: 1, campaignSlug: 1, campaignSlugs: 1 })
    .toArray();

  return rows
    .flatMap((row) =>
      normalizeCampaignSlugs(row?.campaignSlugs, row?.campaignSlug).map(
        (campaignSlug) => ({
          username: normalizeUsername(row?.username),
          campaignSlug,
        })
      )
    )
    .filter((row) => row.username && row.campaignSlug);
}

export async function createCampaignAccount(campaignSlug, input) {
  const username = normalizeUsername(input.username);
  const accountId = String(input.accountId || input.id || "").trim();
  const platform = normalizeAccountPlatform(input.platform, "");
  if (!username && !accountId) throw new Error("Account is required");

  const slug = normalizeSlug(campaignSlug);
  const campaign = slug ? await findCampaignBySlug(slug) : null;
  if (slug && !campaign) throw new Error("Campaign not found");
  if (!slug) throw new Error("campaignSlug is required");

  const collection = await ensureAccountsCollection();
  const query = accountId ? { id: accountId } : buildUsernamePlatformQuery({ username, platform });
  const existingAccount = await collection.findOne(query, { projection: { _id: 0 } });
  if (!existingAccount) throw new Error("Account not found");
  const existingCampaignSlugs = normalizeCampaignSlugs(
    existingAccount?.campaignSlugs,
    existingAccount?.campaignSlug
  );

  if (existingCampaignSlugs.includes(slug)) {
    throw new Error("Account is already assigned to this campaign");
  }

  if (existingCampaignSlugs.length) {
    throw new Error("Account is already assigned to another campaign");
  }

  const now = new Date().toISOString();
  const nextCampaignSlugs = [slug];
  const account = normalizeAccount(existingAccount, {
    niche: existingAccount?.niche || campaign?.niche || input.niche || "streaming",
    campaignSlug: slug,
    campaignSlugs: nextCampaignSlugs,
    campaignType: campaign?.campaignType,
    updated_at: now,
  });

  await collection.updateOne(query, { $set: account });
  return normalizeAccount(account, {
    campaignSlug: slug,
    campaignSlugs: nextCampaignSlugs,
    campaignType: campaign?.campaignType,
  });
}

export async function releaseCampaignAccount(input = {}) {
  const username = normalizeUsername(input.username);
  const accountId = String(input.accountId || input.id || "").trim();
  const platform = normalizeAccountPlatform(input.platform, "");
  const campaignSlug = normalizeSlug(input.campaignSlug);

  if (!username && !accountId) {
    throw new Error("Account is required");
  }

  const collection = await ensureAccountsCollection();
  const query = accountId ? { id: accountId } : buildUsernamePlatformQuery({ username, platform });
  const existingAccount = await collection.findOne(query, { projection: { _id: 0 } });

  if (!existingAccount) {
    throw new Error("Account not found");
  }

  const existingCampaignSlugs = normalizeCampaignSlugs(
    existingAccount?.campaignSlugs,
    existingAccount?.campaignSlug
  );
  if (campaignSlug && !existingCampaignSlugs.includes(campaignSlug)) {
    throw new Error("Account is not assigned to this campaign");
  }

  const nextCampaignSlugs = campaignSlug
    ? existingCampaignSlugs.filter((slug) => slug !== campaignSlug)
    : [];
  const remoteAccounts = serializeAccounts(await fetchAllAccounts());
  const restoredAccount =
    remoteAccounts.find((account) => String(account?.id || "").trim() === accountId) ||
    remoteAccounts.find(
      (account) =>
        normalizeUsername(account?.username) === normalizeUsername(existingAccount?.username) &&
        normalizeAccountPlatform(account?.platform) ===
          normalizeAccountPlatform(existingAccount?.platform)
    ) ||
    existingAccount;

  const now = new Date().toISOString();
  const account = normalizeAccount(restoredAccount, {
    id: existingAccount.id,
    username: existingAccount.username,
    campaignSlug: "",
    campaignSlugs: nextCampaignSlugs,
    campaignType: "manual",
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
