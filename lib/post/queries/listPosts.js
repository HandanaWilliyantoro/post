import { getDb } from "@/lib/db";
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
  await collection.createIndex({ created_at: -1 });

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
  const posts = await collection.find(query).sort({ created_at: -1 }).toArray();
  const normalizedPosts = posts.map(normalizeValue);

  postsCache.set(key, {
    value: normalizedPosts,
    expiresAt: Date.now() + POSTS_CACHE_TTL_MS,
  });

  return normalizedPosts;
}

export async function getPostById(postId) {
  const collection = await ensurePostsCollection();
  const post = await collection.findOne(
    { id: String(postId || "").trim() },
    { projection: { _id: 0 } }
  );

  return post ? normalizeValue(post) : null;
}

export async function listPostsPage(options = {}) {
  const collection = await ensurePostsCollection();
  const requestedPage = Math.max(1, Number(options.page || 1));
  const pageSize = Math.max(1, Number(options.pageSize || 10));
  const campaignSlug = String(options.campaignSlug || "").trim();
  const queryText = String(options.queryText || "").trim();
  const regex = queryText ? new RegExp(escapeRegex(queryText), "i") : null;
  const query = {
    ...(campaignSlug ? { campaignSlug } : {}),
    ...(regex
      ? {
          $or: [
            { content: regex },
            { id: regex },
            { origin: regex },
            { campaignType: regex },
            { campaignId: regex },
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
    .sort({ created_at: -1 })
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
