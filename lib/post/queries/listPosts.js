import { getDb } from "@/lib/db";
const COLLECTION = "posts";
const POSTS_CACHE_TTL_MS = 30 * 1000;

let postsCache = new Map();

function cacheKey(campaignSlug) {
  return campaignSlug || "__all__";
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

  await collection.createIndex({ campaignSlug: 1, status: 1 });
  await collection.createIndex({ status: 1, publish_at: 1 });
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

export async function listDuePosts(options = {}) {
  const limit = Math.max(1, Number(options.limit || 25));
  const collection = await ensurePostsCollection();
  const nowIso = new Date().toISOString();
  const posts = await collection
    .find({
      status: { $in: ["queued", "scheduled"] },
      publish_at: { $lte: nowIso },
    })
    .sort({ publish_at: 1, created_at: 1 })
    .limit(limit)
    .toArray();

  return posts.map(normalizeValue);
}

export const getAllPosts = listAllPosts;

export function clearPostsCache() {
  postsCache = new Map();
}
