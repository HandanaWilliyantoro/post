import { getDb } from "@/lib/db";

import kickAccounts from "@/lib/accounts/data/kickAccounts";
import {
  fetchAllAccounts,
  filterEligibleAccounts,
  serializeAccounts,
} from "@/lib/accounts/fetchAccounts";

export const CAMPAIGN_ACCOUNT_COLLECTIONS = {
  "kick-campaign": "kickCampaignAccounts",
  "lospollostv-campaign": "lospollostvAccounts",
};

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function getCollectionName(campaignSlug) {
  return CAMPAIGN_ACCOUNT_COLLECTIONS[campaignSlug] || null;
}

export function splitCampaignAccounts(accounts) {
  const eligibleAccounts = filterEligibleAccounts(accounts);
  const kickUsernames = new Set(kickAccounts.map(normalizeUsername));

  return eligibleAccounts.reduce(
    (result, account) => {
      const username = normalizeUsername(account.username);
      const target = kickUsernames.has(username)
        ? result.kickCampaignAccounts
        : result.lospollostvAccounts;

      target.push(account);
      return result;
    },
    {
      kickCampaignAccounts: [],
      lospollostvAccounts: [],
    }
  );
}

export async function getCampaignAccounts(campaignSlug) {
  const collectionName = getCollectionName(campaignSlug);

  if (!collectionName) {
    return [];
  }

  const db = await getDb();
  return db
    .collection(collectionName)
    .find({})
    .project({ _id: 0 })
    .sort({ username: 1 })
    .toArray()
    .then(serializeAccounts);
}

export async function createCampaignAccount(campaignSlug, input) {
  const collectionName = getCollectionName(campaignSlug);

  if (!collectionName) {
    throw new Error("Unsupported campaign for account creation");
  }

  const username = normalizeUsername(input.username);

  if (!username) {
    throw new Error("Username is required");
  }

  const now = new Date().toISOString();
  const db = await getDb();
  const collection = db.collection(collectionName);
  const existingAccount = await collection.findOne(
    { username },
    { projection: { _id: 0, id: 1 } }
  );

  if (existingAccount) {
    throw new Error("An account with that username already exists in this campaign");
  }

  const account = serializeAccounts([
    {
      id: String(input.id || crypto.randomUUID()).trim(),
      platform: normalizeUsername(input.platform || "instagram"),
      username,
      avatar_url: String(input.avatar_url || "").trim(),
      status: normalizeUsername(input.status || "active"),
      created_at: now,
      updated_at: now,
      seededAt: now,
      campaignSlug,
    },
  ])[0];

  await collection.insertOne({ ...account });

  return account;
}

export async function seedCampaignAccounts() {
  const sourceAccounts = await fetchAllAccounts();
  const { kickCampaignAccounts, lospollostvAccounts } =
    splitCampaignAccounts(sourceAccounts);
  const seededAt = new Date();
  const db = await getDb();

  await Promise.all(
    Object.values(CAMPAIGN_ACCOUNT_COLLECTIONS).map((collectionName) =>
      db.collection(collectionName).deleteMany({})
    )
  );

  if (lospollostvAccounts.length) {
    await db.collection(CAMPAIGN_ACCOUNT_COLLECTIONS["lospollostv-campaign"]).insertMany(
      lospollostvAccounts.map((account) => ({
        ...account,
        seededAt,
        campaignSlug: "lospollostv-campaign",
      }))
    );
  }

  if (kickCampaignAccounts.length) {
    await db.collection(CAMPAIGN_ACCOUNT_COLLECTIONS["kick-campaign"]).insertMany(
      kickCampaignAccounts.map((account) => ({
        ...account,
        seededAt,
        campaignSlug: "kick-campaign",
      }))
    );
  }
  return {
    totalFetched: sourceAccounts.length,
    totalEligible: kickCampaignAccounts.length + lospollostvAccounts.length,
    lospollostvAccounts: lospollostvAccounts.length,
    kickCampaignAccounts: kickCampaignAccounts.length,
    excludedKickUsernames: [...kickAccounts],
  };
}
