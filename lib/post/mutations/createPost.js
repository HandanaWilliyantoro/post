import postonceClient from "@/lib/api/postonceClient";
import { getDb } from "@/lib/db";
import {
  clearPostsCache,
  ensurePostsCollection,
} from "@/lib/post/queries/listPosts";

const LOG_PREFIX = "[post/createPost]";

function getErrorDetails(error) {
  return error?.response?.data || error?.message || "Unknown error";
}

function normalizeCampaignSlug(value) {
  const normalized = String(value || "").trim();
  return normalized || "lospollostv-campaign";
}

export async function persistPostRecord(post, options = {}) {
  const collection = await ensurePostsCollection();
  const db = await getDb();
  const now = new Date().toISOString();
  const campaignSlug = normalizeCampaignSlug(options.campaignSlug);
  const postId =
    String(post?.id || post?.post_id || options.id || "").trim() ||
    crypto.randomUUID();

  const document = {
    ...post,
    id: postId,
    content: String(post?.content || options.content || "").trim(),
    status: String(post?.status || "queued").trim().toLowerCase(),
    publish_at: post?.publish_at || options.publish_at || null,
    created_at: post?.created_at || now,
    updated_at: post?.updated_at || now,
    origin: post?.origin || "postonce",
    targets: Array.isArray(post?.targets) ? post.targets : options.targets || [],
    media: Array.isArray(post?.media) ? post.media : options.media || [],
    source_file_path: options.source_file_path || null,
    clip_moment: options.clip_moment || null,
    duplicateKey: options.duplicateKey || null,
    campaignSlug,
    syncedAt: now,
  };

  await collection.updateOne(
    { id: postId },
    { $set: document },
    { upsert: true }
  );

  clearPostsCache();

  const persistedPost = await db.collection("posts").findOne(
    { id: postId },
    { projection: { _id: 0 } }
  );

  if (!persistedPost) {
    throw new Error("Post was created externally but not persisted locally");
  }

  return persistedPost;
}

export async function createPost(payload) {
  try {
    const { campaignSlug, ...postoncePayload } = payload || {};
    const response = await postonceClient.post("/posts", postoncePayload);

    if (!response) {
      throw new Error("Invalid API response");
    }

    return persistPostRecord(response, {
      ...postoncePayload,
      campaignSlug,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} error:`, getErrorDetails(error));
    throw error;
  }
}
