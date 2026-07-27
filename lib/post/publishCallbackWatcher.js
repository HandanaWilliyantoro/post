import config from "@/config";
import {
  getSocialPost,
  listSocialPostResults,
} from "@/lib/postforme/posts";
import { clearPostsCache, ensurePostsCollection } from "@/lib/post/queries/listPosts";
import {
  deliverPublishedCallback,
  isCallbackDeliveryConfigured,
} from "@/lib/post/callbackDelivery";

const WATCHER_KEY = "__post_publish_callback_watcher__";
const ACTIVE_KEY = "__post_publish_callback_running__";
const DEFAULT_WATCHER_CONCURRENCY = 4;
const DEFAULT_WATCHER_LOOKAHEAD_MS = 10 * 60 * 1000;

function getWatcherConcurrency() {
  return Math.max(
    1,
    Math.min(
      20,
      Number(process.env.POST_PUBLISH_WATCHER_CONCURRENCY || DEFAULT_WATCHER_CONCURRENCY) ||
        DEFAULT_WATCHER_CONCURRENCY
    )
  );
}

function getWatcherLookaheadIso() {
  const lookaheadMs = Math.max(
    0,
    Number(process.env.POST_PUBLISH_WATCHER_LOOKAHEAD_MS || DEFAULT_WATCHER_LOOKAHEAD_MS) ||
      DEFAULT_WATCHER_LOOKAHEAD_MS
  );

  return new Date(Date.now() + lookaheadMs).toISOString();
}

async function mapWithConcurrency(items, limit, iteratee) {
  const list = Array.isArray(items) ? items : [];

  if (!list.length) {
    return [];
  }

  const results = new Array(list.length);
  const workerCount = Math.max(1, Math.min(limit, list.length));
  let cursor = 0;

  async function worker() {
    while (true) {
      const currentIndex = cursor;

      if (currentIndex >= list.length) {
        return;
      }

      cursor += 1;
      results[currentIndex] = await iteratee(list[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(normalizeText(value));
}

function findUrlInObject(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 3) {
    return "";
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      typeof nestedValue === "string" &&
      key.toLowerCase().includes("url") &&
      isHttpUrl(nestedValue)
    ) {
      return nestedValue;
    }

    if (nestedValue && typeof nestedValue === "object") {
      const nestedUrl = findUrlInObject(nestedValue, depth + 1);

      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  return "";
}

function getPlatformPostId(result = {}) {
  const platformData = result.platform_data || {};
  const details = result.details || {};

  return normalizeText(
    result.platform_post_id ||
      result.external_post_id ||
      platformData.platform_post_id ||
      platformData.post_id ||
      platformData.id ||
      details.platform_post_id ||
      details.post_id ||
      details.id
  );
}

function getPlatformUrl(result = {}) {
  const platformData = result.platform_data || {};
  const details = result.details || {};

  return normalizeText(
    result.platform_url ||
      result.platform_post_url ||
      platformData.platform_url ||
      platformData.platform_post_url ||
      platformData.permalink ||
      platformData.post_url ||
      platformData.share_url ||
      details.platform_url ||
      details.platform_post_url ||
      details.permalink ||
      details.post_url ||
      details.share_url ||
      findUrlInObject(platformData) ||
      findUrlInObject(details)
  );
}

function buildAccountMap(post) {
  const accountMap = new Map();
  const sources = [
    ...(Array.isArray(post?.targets) ? post.targets : []),
    ...(Array.isArray(post?.social_accounts) ? post.social_accounts : []),
  ];

  for (const account of sources) {
    const id = normalizeText(account?.account_id || account?.id);

    if (!id) {
      continue;
    }

    accountMap.set(id, {
      account_id: id,
      username: normalizeText(account?.username),
      avatar_url: normalizeText(
        account?.avatar_url ||
          account?.avatarUrl ||
          account?.profile_photo_url
      ),
      platform: normalizeText(account?.platform),
      status: normalizeText(account?.status),
    });
  }

  return accountMap;
}

function buildTargetFromResult(result, accountMap) {
  const accountId = normalizeText(result?.social_account_id);
  const account = accountMap.get(accountId) || { account_id: accountId };
  const platformUrl = getPlatformUrl(result);

  return {
    ...account,
    account_id: accountId || account.account_id,
    platform_post_id: getPlatformPostId(result) || null,
    platform_post_url: platformUrl || null,
    target_post_id: normalizeText(result?.id) || null,
    status: result?.success === false ? "failed" : "published",
    error: result?.success === false
      ? result?.error || "PostForMe reported a failed result"
      : null,
  };
}

function mergeRemotePost(localPost, remotePost, postResults = []) {
  const accountMap = buildAccountMap({
    ...(localPost || {}),
    ...(remotePost || {}),
  });
  const resultTargets = postResults
    .map((result) => buildTargetFromResult(result, accountMap))
    .filter((target) => target.account_id);
  const targets = resultTargets.length
    ? resultTargets
    : Array.isArray(remotePost?.targets) && remotePost.targets.length
      ? remotePost.targets
      : Array.isArray(localPost?.targets)
        ? localPost.targets
        : [];
  const status = resolvePostStatus(remotePost, postResults);

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
    origin: localPost?.origin ?? remotePost?.origin ?? "postforme",
    publish_at: remotePost?.publish_at ?? localPost?.publish_at ?? null,
    scheduled_at: remotePost?.scheduled_at ?? localPost?.scheduled_at ?? null,
    status,
    created_at: remotePost?.created_at ?? localPost?.created_at ?? null,
    updated_at: remotePost?.updated_at ?? localPost?.updated_at ?? null,
    targets,
    postResults,
  };
}

function resolvePostStatus(remotePost, postResults = []) {
  const remoteStatus = normalizeText(remotePost?.status || "scheduled");

  if (!postResults.length) {
    return remoteStatus;
  }

  const failedCount = postResults.filter((result) => result?.success === false).length;
  const successCount = postResults.filter((result) => result?.success === true).length;

  if (failedCount && successCount) {
    return "partial";
  }

  if (failedCount && remoteStatus === "processed") {
    return "failed";
  }

  return remoteStatus;
}

function getInstagramTarget(post) {
  return (Array.isArray(post?.targets) ? post.targets : []).find((target) => {
    const platform = normalizeText(target?.platform).toLowerCase();
    const url = normalizeText(target?.platform_post_url);
    return platform === "instagram" && Boolean(url);
  });
}

async function updatePostState(postId, data) {
  const collection = await ensurePostsCollection();
  await collection.updateOne({ id: postId }, { $set: data });
  clearPostsCache();
}

async function markPostCheckFailed(post, error) {
  const now = new Date().toISOString();
  const nextAttempts = Number(post?.publishCallback?.attempts || 0) + 1;

  await updatePostState(post.id, {
    "publishCallback.state": "failed",
    "publishCallback.attempts": nextAttempts,
    "publishCallback.lastCheckedAt": now,
    "publishCallback.lastError":
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      "Failed to refresh PostForMe post",
  });
}

async function processPost(post) {
  if (post?.localOnly === true) {
    return;
  }

  const [remotePost, postResults] = await Promise.all([
    getSocialPost(post.id, { fallback: post }),
    listSocialPostResults(post.id),
  ]);
  const mergedPost = mergeRemotePost(post, remotePost, postResults);
  const now = new Date().toISOString();
  const instagramTarget = getInstagramTarget(mergedPost);
  const nextBaseState = {
    content: mergedPost.content,
    external_id: mergedPost.external_id ?? null,
    media: mergedPost.media,
    origin: mergedPost.origin,
    publish_at: mergedPost.publish_at,
    scheduled_at: mergedPost.scheduled_at,
    status: mergedPost.status,
    targets: mergedPost.targets,
    postResults: mergedPost.postResults,
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

  const instagramUrl = normalizeText(instagramTarget.platform_post_url);
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
  if (global[ACTIVE_KEY]) return { processed: 0, skipped: true };
  global[ACTIVE_KEY] = true;
  try {
    const limit = Math.max(
      1,
      Number(options.limit || config.postPublishWatcher.batchSize || 20)
    );
    const lookaheadIso = getWatcherLookaheadIso();
    const collection = await ensurePostsCollection();
    const posts = await collection
      .find({
        "publishCallback.state": { $in: ["pending", "ready", "failed"] },
        "publishCallback.sentAt": { $exists: false },
        localOnly: { $ne: true },
        status: { $nin: ["cancelled"] },
        $or: [
          { publish_at: { $exists: false } },
          { publish_at: null },
          { publish_at: "" },
          { publish_at: { $lte: lookaheadIso } },
          { status: { $nin: ["draft", "scheduled"] } },
          { "publishCallback.state": { $in: ["ready", "failed"] } },
        ],
      })
      .sort({ publish_at: 1, created_at: 1 })
      .limit(limit)
      .project({ _id: 0 })
      .toArray();

    await mapWithConcurrency(posts, getWatcherConcurrency(), async (post) => {
      try {
        await processPost(post);
      } catch (error) {
        await markPostCheckFailed(post, error);
      }
    });

    return { processed: posts.length, skipped: false };
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
  global[WATCHER_KEY].unref?.();
  void runPostPublishCallbackWatcher();
}
