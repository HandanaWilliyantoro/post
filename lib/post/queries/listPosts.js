import { getDb } from "@/lib/db";
import { normalizePostStatusFilter } from "@/lib/post/statusFilters";
import {
  easternDateInputToIsoRangeEnd,
  easternDateInputToIsoRangeStart,
  normalizeEasternDateInput,
} from "@/lib/utils/easternTime";

const COLLECTION = "posts";
const POSTS_CACHE_TTL_MS = 30 * 1000;

let postsCache = new Map();

function cacheKey(campaignSlug) {
  return campaignSlug || "__all__";
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "_id")
        .map(([key, nestedValue]) => [key, normalizeValue(nestedValue)])
    );
  }

  return value;
}

function buildPublishAtQuery(options = {}) {
  const publishDate = normalizeEasternDateInput(options.publishDate);

  if (!publishDate) {
    return null;
  }

  return {
    $gte: easternDateInputToIsoRangeStart(publishDate),
    $lte: easternDateInputToIsoRangeEnd(publishDate),
  };
}

function buildStatusQuery(options = {}) {
  const status = normalizePostStatusFilter(options.status);

  if (!status) {
    return null;
  }

  return new RegExp(`^${escapeRegex(status)}$`, "i");
}

export async function ensurePostsCollection() {
  const db = await getDb();
  const collections = await db
    .listCollections({ name: COLLECTION }, { nameOnly: true })
    .toArray();
  let collection;

  if (!collections.length) {
    await db.createCollection(COLLECTION);
    collection = db.collection(COLLECTION);
  } else {
    collection = db.collection(COLLECTION);
  }

  await collection.createIndex({ campaignSlug: 1, publish_at: 1 });
  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex(
    { duplicateKey: 1 },
    { unique: true, sparse: true }
  );
  await collection.createIndex({ campaignSlug: 1, publish_at: 1, created_at: -1 });
  await collection.createIndex({ campaignSlug: 1, publish_at: -1, created_at: -1 });
  await collection.createIndex({ created_at: -1 });
  await collection.updateMany(
    { urlWatcherEnabled: { $exists: false } },
    { $set: { urlWatcherEnabled: false } }
  );

  return collection;
}

export async function listAllPosts(options = {}) {
  const campaignSlug = options.campaignSlug || null;
  const key = cacheKey(campaignSlug);
  const cachedEntry = postsCache.get(key);

  if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
    return cachedEntry.value;
  }

  const collection = await ensurePostsCollection();
  const query = campaignSlug ? { campaignSlug } : {};
  const posts = await collection
    .find(query)
    .sort({ publish_at: -1, created_at: -1 })
    .toArray();
  const normalizedPosts = posts.map(normalizeValue);

  postsCache.set(key, {
    value: normalizedPosts,
    expiresAt: Date.now() + POSTS_CACHE_TTL_MS,
  });

  return normalizedPosts;
}

export async function listFailedPosts(options = {}) {
  const collection = await ensurePostsCollection();
  const campaignSlug = String(options.campaignSlug || "").trim();
  const runId = String(options.runId || "").trim();
  const duplicateKeys = Array.isArray(options.duplicateKeys)
    ? [...new Set(
        options.duplicateKeys
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )]
    : [];
  const query = {
    status: "failed",
    localOnly: true,
  };

  if (campaignSlug) {
    query.campaignSlug = campaignSlug;
  }

  if (duplicateKeys.length) {
    query.duplicateKey = { $in: duplicateKeys };
  }

  if (runId) {
    query.$or = [
      { "failure.runId": runId },
      { "failure.retrySourceRunId": runId },
    ];
  }

  return collection
    .find(query)
    .project({ _id: 0 })
    .sort({ updated_at: -1, created_at: -1 })
    .toArray()
    .then((rows) => rows.map(normalizeValue));
}

export async function listFailedPostsByDuplicateKeys(duplicateKeys = []) {
  const normalizedKeys = Array.isArray(duplicateKeys)
    ? [...new Set(
        duplicateKeys
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )]
    : [];

  if (!normalizedKeys.length) {
    return [];
  }

  return listFailedPosts({ duplicateKeys: normalizedKeys });
}

export async function getPostById(postId) {
  const collection = await ensurePostsCollection();
  const post = await collection.findOne(
    { id: String(postId || "").trim() },
    { projection: { _id: 0 } }
  );

  return post ? normalizeValue(post) : null;
}

export async function getLatestCampaignPublishAt(campaignSlug) {
  const normalizedCampaignSlug = String(campaignSlug || "").trim();

  if (!normalizedCampaignSlug) {
    return null;
  }

  const collection = await ensurePostsCollection();
  const posts = await collection
    .find(
      {
        campaignSlug: normalizedCampaignSlug,
        publish_at: { $type: "string", $ne: "" },
        status: { $nin: ["failed", "cancelled"] },
      },
      {
        projection: { _id: 0, publish_at: 1 },
        sort: { publish_at: -1, created_at: -1 },
        limit: 10,
      }
    )
    .toArray();

  for (const post of posts) {
    const publishAt = String(post?.publish_at || "").trim();

    if (publishAt && !Number.isNaN(new Date(publishAt).getTime())) {
      return publishAt;
    }
  }

  return null;
}

export async function listPostsPage(options = {}) {
  const collection = await ensurePostsCollection();
  const requestedPage = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Number(options.pageSize || 10));
  const campaignSlug = String(options.campaignSlug || "").trim();
  const queryText = String(options.queryText || "").trim();
  const publishAtQuery = buildPublishAtQuery(options);
  const statusQuery = buildStatusQuery(options);
  const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
  const query = {
    ...(campaignSlug ? { campaignSlug } : {}),
    ...(publishAtQuery ? { publish_at: publishAtQuery } : {}),
    ...(statusQuery ? { status: statusQuery } : {}),
    ...(regex
      ? {
          $or: [
            { content: regex },
            { id: regex },
            { origin: regex },
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
    .sort({ publish_at: -1, created_at: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray()
    .then((rows) => rows.map(normalizeValue));

  return {
    items,
    page,
    pageSize,
    totalItems,
  };
}

export function clearPostsCache() {
  postsCache = new Map();
}
