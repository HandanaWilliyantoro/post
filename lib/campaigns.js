import { getDb } from "@/lib/db";
import { defaultCampaignRoutes } from "@/lib/campaignDefaults";
import {
  listDeletedCampaignSlugs,
  markCampaignDeleted,
  purgeCampaignData,
} from "@/lib/campaignDeletion";

const COLLECTION = "campaigns";
const DEFAULT_TREND = [0, 0, 0, 0, 0, 0];

function toHref(slug) {
  return `/campaigns/${slug}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeMetrics(metrics = {}) {
  return {
    totalPosts: {
      value: Number(metrics?.totalPosts?.value || 0),
      trend: Array.isArray(metrics?.totalPosts?.trend)
        ? metrics.totalPosts.trend
        : DEFAULT_TREND,
    },
    queuedPosts: {
      value: Number(metrics?.queuedPosts?.value || 0),
      trend: Array.isArray(metrics?.queuedPosts?.trend)
        ? metrics.queuedPosts.trend
        : DEFAULT_TREND,
    },
    totalAccounts: {
      value: Number(metrics?.totalAccounts?.value || 0),
      trend: Array.isArray(metrics?.totalAccounts?.trend)
        ? metrics.totalAccounts.trend
        : DEFAULT_TREND,
    },
  };
}

function normalizeCampaignDocument(campaign) {
  const slug = normalizeText(campaign?.slug);

  return {
    slug,
    isDefault: Boolean(campaign?.isDefault),
    niche: normalizeText(campaign?.niche) || "streaming",
    label: normalizeText(campaign?.label),
    description: normalizeText(campaign?.description),
    href: toHref(slug),
    icon: normalizeText(campaign?.icon) || "spark",
    metrics: normalizeMetrics(campaign?.metrics),
    created_at: campaign?.created_at || new Date().toISOString(),
  };
}

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

  return collection;
}

export async function getCampaignRoutes() {
  const collection = await ensureCampaignsCollection();
  const deletedSlugs = await listDeletedCampaignSlugs();
  const customCampaigns = await collection
    .find({})
    .project({ _id: 0 })
    .sort({ created_at: 1, label: 1 })
    .toArray();

  return [
    ...defaultCampaignRoutes.filter((campaign) => !deletedSlugs.has(campaign.slug)),
    ...customCampaigns.map((campaign) => normalizeCampaignDocument(campaign)),
  ];
}

export async function findCampaignBySlug(slug) {
  const normalizedSlug = normalizeText(slug);

  if (!normalizedSlug) {
    return null;
  }

  const deletedSlugs = await listDeletedCampaignSlugs();

  if (deletedSlugs.has(normalizedSlug)) {
    return null;
  }

  const defaultCampaign = defaultCampaignRoutes.find(
    (campaign) => campaign.slug === normalizedSlug
  );

  if (defaultCampaign) {
    return defaultCampaign;
  }

  const collection = await ensureCampaignsCollection();
  const campaign = await collection.findOne(
    { slug: normalizedSlug },
    { projection: { _id: 0 } }
  );

  return campaign ? normalizeCampaignDocument(campaign) : null;
}

export async function createCampaign(input = {}) {
  const label = normalizeText(input.label);
  const description = normalizeText(input.description);
  const icon = normalizeText(input.icon) || "spark";
  const niche = normalizeText(input.niche) || "streaming";
  const slugBase = slugify(input.slug || label);
  const slug = slugBase.endsWith("-campaign") ? slugBase : `${slugBase}-campaign`;

  if (!label) {
    throw new Error("Campaign name is required");
  }

  if (!slug || slug === "-campaign") {
    throw new Error("Campaign slug is invalid");
  }

  const existsInDefaults = defaultCampaignRoutes.some(
    (campaign) => campaign.slug === slug
  );

  if (existsInDefaults) {
    throw new Error("A campaign with that slug already exists");
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
      queuedPosts: { value: 0, trend: DEFAULT_TREND },
      totalAccounts: { value: 0, trend: DEFAULT_TREND },
    },
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
  const isDefaultCampaign = defaultCampaignRoutes.some(
    (campaign) => campaign.slug === normalizedSlug
  );

  if (isDefaultCampaign) {
    await markCampaignDeleted(normalizedSlug);
    await purgeCampaignData(normalizedSlug);
    return { slug: normalizedSlug };
  }

  const result = await collection.deleteOne({ slug: normalizedSlug });

  if (!result.deletedCount) {
    throw new Error("Campaign not found");
  }

  await purgeCampaignData(normalizedSlug);
  return { slug: normalizedSlug };
}
