import postonceClient from "@/lib/api/postonceClient";
import config from "@/config";
import { clearPostsCache, ensurePostsCollection } from "@/lib/post/queries/listPosts";
import {
  deliverPublishedCallback,
  isCallbackDeliveryConfigured,
} from "@/lib/post/callbackDelivery";

const WATCHER_KEY = "__post_publish_callback_watcher__";
const ACTIVE_KEY = "__post_publish_callback_running__";

function mergeRemotePost(localPost, remotePost) {
  return {
    ...(localPost || {}),
    ...(remotePost || {}),
    id: remotePost?.id || localPost?.id,
    content: remotePost?.content ?? localPost?.content ?? "",
    external_id: remotePost?.external_id ?? localPost?.external_id ?? null,
    media: Array.isArray(remotePost?.media)
      ? remotePost.media
      : Array.isArray(localPost?.media)
        ? localPost.media
        : [],
    origin: remotePost?.origin ?? localPost?.origin ?? null,
    publish_at: remotePost?.publish_at ?? localPost?.publish_at ?? null,
    status: remotePost?.status ?? localPost?.status ?? null,
    created_at: remotePost?.created_at ?? localPost?.created_at ?? null,
    targets: Array.isArray(remotePost?.targets)
      ? remotePost.targets
      : Array.isArray(localPost?.targets)
        ? localPost.targets
        : [],
  };
}

function getInstagramTarget(post) {
  return (Array.isArray(post?.targets) ? post.targets : []).find((target) => {
    const platform = String(target?.platform || "").trim().toLowerCase();
    const url = String(target?.platform_post_url || "").trim();
    return platform === "instagram" && Boolean(url);
  });
}

async function updatePostState(postId, data) {
  const collection = await ensurePostsCollection();
  await collection.updateOne({ id: postId }, { $set: data });
  clearPostsCache();
}

async function processPost(post) {
  if (post?.localOnly === true) {
    return;
  }

  const remotePost = await postonceClient.get(`/posts/${post.id}`);
  const mergedPost = mergeRemotePost(post, remotePost);
  const now = new Date().toISOString();
  const instagramTarget = getInstagramTarget(mergedPost);
  const nextBaseState = {
    content: mergedPost.content,
    external_id: mergedPost.external_id ?? null,
    media: mergedPost.media,
    origin: mergedPost.origin,
    publish_at: mergedPost.publish_at,
    status: mergedPost.status,
    targets: mergedPost.targets,
    syncedAt: now,
    "publishCallback.lastCheckedAt": now,
  };

  if (!instagramTarget) {
    await updatePostState(post.id, {
      ...nextBaseState,
      "publishCallback.state": "pending",
    });
    return;
  }

  const instagramUrl = String(instagramTarget.platform_post_url || "").trim();
  if (!isCallbackDeliveryConfigured()) {
    await updatePostState(post.id, {
      ...nextBaseState,
      "publishCallback.state": "ready",
      "publishCallback.instagramUrl": instagramUrl,
    });
    return;
  }

  const nextAttempts = Number(post?.publishCallback?.attempts || 0) + 1;
  try {
    await deliverPublishedCallback(mergedPost, instagramTarget);
    await updatePostState(post.id, {
      ...nextBaseState,
      "publishCallback.state": "sent",
      "publishCallback.attempts": nextAttempts,
      "publishCallback.instagramUrl": instagramUrl,
      "publishCallback.sentAt": now,
      "publishCallback.lastError": "",
    });
  } catch (error) {
    await updatePostState(post.id, {
      ...nextBaseState,
      "publishCallback.state": "failed",
      "publishCallback.attempts": nextAttempts,
      "publishCallback.instagramUrl": instagramUrl,
      "publishCallback.lastError":
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Callback delivery failed",
    });
  }
}

export async function runPostPublishCallbackWatcher(options = {}) {
  if (global[ACTIVE_KEY]) return;
  global[ACTIVE_KEY] = true;
  try {
    const limit = Math.max(
      1,
      Number(options.limit || config.postPublishWatcher.batchSize || 20)
    );
    const collection = await ensurePostsCollection();
    const posts = await collection
      .find({
        "publishCallback.state": { $in: ["pending", "ready", "failed"] },
        "publishCallback.sentAt": { $exists: false },
        localOnly: { $ne: true },
        status: { $nin: ["cancelled"] },
      })
      .sort({ publish_at: 1, created_at: 1 })
      .limit(limit)
      .project({ _id: 0 })
      .toArray();

    for (const post of posts) {
      await processPost(post);
    }
  } finally {
    global[ACTIVE_KEY] = false;
  }
}

export function startPostPublishCallbackWatcher() {
  if (typeof window !== "undefined") return;
  if (global[WATCHER_KEY]) return;
  const intervalMs = Math.max(
    1000,
    Number(config.postPublishWatcher.pollIntervalMs || 15000)
  );
  global[WATCHER_KEY] = setInterval(() => {
    void runPostPublishCallbackWatcher();
  }, intervalMs);
  void runPostPublishCallbackWatcher();
}
