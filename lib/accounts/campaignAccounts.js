import { getDb } from "@/lib/db";
import { findCampaignBySlug } from "@/lib/campaigns";

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

export function getAccountCollectionName(campaignSlug) {
  return CAMPAIGN_ACCOUNT_COLLECTIONS[campaignSlug] || "campaignAccounts";
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
  const collectionName = getAccountCollectionName(campaignSlug);

  const db = await getDb();
  const query =
    collectionName === "campaignAccounts" ? { campaignSlug } : {};

  return db
    .collection(collectionName)
    .find(query)
    .project({ _id: 0 })
    .sort({ username: 1 })
    .toArray()
    .then(serializeAccounts);
}

export async function getAllCampaignAccountAssignments() {
  const db = await getDb();
  const specialAssignments = await Promise.all(
    Object.entries(CAMPAIGN_ACCOUNT_COLLECTIONS).map(async ([campaignSlug, collectionName]) => {
      const rows = await db
        .collection(collectionName)
        .find({})
        .project({ _id: 0, username: 1 })
        .toArray();

      return rows.map((row) => ({
        username: normalizeUsername(row?.username),
        campaignSlug,
      }));
    })
  );

  const sharedAssignments = await db
    .collection("campaignAccounts")
    .find({})
    .project({ _id: 0, username: 1, campaignSlug: 1 })
    .toArray();

  return [...specialAssignments.flat(), ...sharedAssignments.map((row) => ({
    username: normalizeUsername(row?.username),
    campaignSlug: String(row?.campaignSlug || "").trim(),
  }))].filter((row) => row.username && row.campaignSlug);
}

export async function createCampaignAccount(campaignSlug, input) {
  const collectionName = getAccountCollectionName(campaignSlug);

  const username = normalizeUsername(input.username);

  if (!username) {
    throw new Error("Username is required");
  }

  const campaign = await findCampaignBySlug(campaignSlug);

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const now = new Date().toISOString();
  const db = await getDb();
  const collection = db.collection(collectionName);
  const existingAccount = await collection.findOne(
    collectionName === "campaignAccounts"
      ? { campaignSlug, username }
      : { username },
    { projection: { _id: 0, id: 1 } }
  );

  if (existingAccount) {
    throw new Error("An account with that username already exists in this campaign");
  }

  const account = serializeAccounts([
    {
      id: String(input.id || crypto.randomUUID()).trim(),
      platform: "instagram",
      username,
      avatar_url: String(input.avatar_url || "").trim(),
      niche: normalizeUsername(campaign.niche || "streaming"),
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
