import { getDb } from "@/lib/db";
import {
  DEFAULT_TREND,
  normalizeCampaignDocument,
  normalizeText,
  slugifyCampaign,
} from "@/lib/campaignNormalization";
import { buildCampaignFields } from "@/lib/campaignMetadata";
import { purgeCampaignData } from "@/lib/campaignDeletion";

const COLLECTION = "campaigns";

export async function ensureCampaignsCollection() {
  const db = await getDb();
  const collections = await db
    .listCollections({ name: COLLECTION }, { nameOnly: true })
    .toArray();

  if (!collections.length) {
    await db.createCollection(COLLECTION);
  }

  const collection = db.collection(COLLECTION);
  await collection.createIndex({ slug: 1 }, { unique: true });
  const deletedCollections = await db
    .listCollections({ name: "deletedCampaigns" }, { nameOnly: true })
    .toArray();

  if (deletedCollections.length) {
    await db.collection("deletedCampaigns").drop();
  }

  return collection;
}

export async function getCampaignRoutes() {
  const collection = await ensureCampaignsCollection();
  const campaigns = await collection
    .find({})
    .project({ _id: 0 })
    .sort({ created_at: 1, label: 1 })
    .toArray();

  return campaigns.map((campaign) => normalizeCampaignDocument(campaign));
}

export async function findCampaignBySlug(slug) {
  const normalizedSlug = normalizeText(slug);

  if (!normalizedSlug) {
    return null;
  }

  const collection = await ensureCampaignsCollection();
  const campaign = await collection.findOne(
    { slug: normalizedSlug },
    { projection: { _id: 0 } }
  );

  if (campaign) return normalizeCampaignDocument(campaign);

  return null;
}

export async function createCampaign(input = {}) {
  const label = normalizeText(input.label);
  const description = normalizeText(input.description);
  const icon = normalizeText(input.icon) || "spark";
  const niche = normalizeText(input.niche) || "streaming";
  const slugBase = slugifyCampaign(input.slug || label);
  const slug = slugBase.endsWith("-campaign") ? slugBase : `${slugBase}-campaign`;
  const campaignFields = buildCampaignFields(input);

  if (!label) {
    throw new Error("Campaign name is required");
  }

  if (!slug || slug === "-campaign") {
    throw new Error("Campaign slug is invalid");
  }

  const collection = await ensureCampaignsCollection();
  const existingCampaign = await collection.findOne(
    { slug },
    { projection: { _id: 0, slug: 1 } }
  );

  if (existingCampaign) {
    throw new Error("A campaign with that slug already exists");
  }

  const campaign = normalizeCampaignDocument({
    slug,
    isDefault: false,
    niche,
    label,
    description:
      description ||
      "A custom campaign created from the sidebar and ready for account and post management.",
    icon,
    metrics: {
      totalPosts: { value: 0, trend: DEFAULT_TREND },
      totalAccounts: { value: 0, trend: DEFAULT_TREND },
    },
    ...campaignFields,
    created_at: new Date().toISOString(),
  });

  await collection.insertOne(campaign);

  return campaign;
}

export async function deleteCampaign(slug) {
  const normalizedSlug = normalizeText(slug);

  if (!normalizedSlug) {
    throw new Error("Campaign slug is required");
  }

  const collection = await ensureCampaignsCollection();
  const result = await collection.deleteOne({ slug: normalizedSlug });

  if (!result.deletedCount) {
    throw new Error("Campaign not found");
  }

  await purgeCampaignData(normalizedSlug);
  return { slug: normalizedSlug };
}
