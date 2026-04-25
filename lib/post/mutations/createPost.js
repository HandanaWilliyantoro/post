import postonceClient from "@/lib/api/postonceClient";
import { findCampaignBySlug } from "@/lib/campaigns";
import { buildCampaignFields } from "@/lib/campaignMetadata";
import { getDb } from "@/lib/db";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";
import {
  clearPostsCache,
  ensurePostsCollection,
} from "@/lib/post/queries/listPosts";

const LOG_PREFIX = "[post/createPost]";

function normalizeCampaignSlug(value) {
  const normalized = String(value || "").trim();
  return normalized || "lospollostv-campaign";
}

export async function persistPostRecord(post, options = {}) {
  const collection = await ensurePostsCollection();
  const db = await getDb();
  const now = new Date().toISOString();
  const campaignSlug = normalizeCampaignSlug(options.campaignSlug);
  const campaignFields = buildCampaignFields(options);
  const postId =
    String(post?.id || post?.post_id || options.id || "").trim() ||
    crypto.randomUUID();

  const document = {
    ...post,
    id: postId,
    content: String(post?.content || options.content || "").trim(),
    publish_at: post?.publish_at || options.publish_at || null,
    created_at: post?.created_at || now,
    updated_at: post?.updated_at || now,
    origin: post?.origin || "postonce",
    targets: Array.isArray(post?.targets) ? post.targets : options.targets || [],
    media: Array.isArray(post?.media) ? post.media : options.media || [],
    source_file_path: options.source_file_path || null,
    duplicateKey: options.duplicateKey || null,
    campaignSlug,
    ...campaignFields,
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
    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const campaignFields = buildCampaignFields(campaign);
    const response = await postonceClient.post("/posts", postoncePayload);

    if (!response) {
      throw new Error("Invalid API response");
    }

    return persistPostRecord(response, {
      ...postoncePayload,
      campaignSlug,
      ...campaignFields,
    });
  } catch (error) {
    console.error(formatErrorForLog(error, `${LOG_PREFIX} error`));
    throw error;
  }
}
