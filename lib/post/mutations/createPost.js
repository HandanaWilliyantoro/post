import { createHash, randomUUID } from "crypto";

import postonceClient from "@/lib/api/postonceClient";
import { normalizeBoolean } from "@/lib/campaignNormalization";
import { findCampaignBySlug } from "@/lib/campaigns";
import { buildCampaignFields } from "@/lib/campaignMetadata";
import { getDb } from "@/lib/db";
import { isFailedLocalOnlyPost, normalizePostStatus } from "@/lib/post/duplicateGuard";
import { startPostPublishCallbackWatcher } from "@/lib/post/publishCallbackWatcher";
import { buildPostOnceTargets } from "@/lib/post/targets";
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

function buildPendingPublishCallback() {
  return {
    state: "pending",
    attempts: 0,
    lastCheckedAt: null,
    lastError: "",
    instagramUrl: null,
    sentAt: null,
  };
}

function buildDisabledPublishCallback() {
  return {
    state: "disabled",
    attempts: 0,
    lastCheckedAt: null,
    lastError: "",
    instagramUrl: null,
    sentAt: null,
  };
}

function normalizeTargets(targets, fallback = []) {
  return Array.isArray(targets) ? targets : fallback;
}

function normalizeMedia(media, fallback = []) {
  return Array.isArray(media) ? media : fallback;
}

function resolvePostId(post, options = {}) {
  return (
    String(post?.id || post?.post_id || options.id || "").trim() || randomUUID()
  );
}

function buildIdempotencyKey(payload) {
  const normalized = JSON.stringify(payload || {});

  if (!normalized) {
    return "";
  }

  return `post-${createHash("sha256").update(normalized).digest("hex")}`;
}

async function findExistingPostRecord(collection, { duplicateKey, postId }) {
  const normalizedDuplicateKey = String(duplicateKey || "").trim();
  const normalizedPostId = String(postId || "").trim();

  if (normalizedDuplicateKey) {
    const existingByDuplicateKey = await collection.findOne({
      duplicateKey: normalizedDuplicateKey,
    });

    if (existingByDuplicateKey) {
      return existingByDuplicateKey;
    }
  }

  if (normalizedPostId) {
    return collection.findOne({ id: normalizedPostId });
  }

  return null;
}

async function loadStoredPost(selector) {
  const db = await getDb();

  return db.collection("posts").findOne(selector, { projection: { _id: 0 } });
}

export async function persistPostRecord(post, options = {}) {
  const collection = await ensurePostsCollection();
  const now = new Date().toISOString();
  const campaignSlug = normalizeCampaignSlug(options.campaignSlug);
  const postId = resolvePostId(post, options);
  const duplicateKey = String(options.duplicateKey || "").trim() || null;
  const existingRecord = await findExistingPostRecord(collection, {
    duplicateKey,
    postId,
  });
  const campaignFields = buildCampaignFields({
    ...(existingRecord || {}),
    ...options,
  });
  const status =
    normalizePostStatus(post?.status || options.status || existingRecord?.status) ||
    "scheduled";

  const document = {
    ...(existingRecord || {}),
    ...post,
    id: postId,
    content: String(post?.content || options.content || "").trim(),
    publish_at: post?.publish_at || options.publish_at || null,
    created_at: post?.created_at || existingRecord?.created_at || now,
    updated_at: post?.updated_at || now,
    origin: post?.origin || "postonce",
    targets: normalizeTargets(post?.targets, options.targets || existingRecord?.targets || []),
    media: normalizeMedia(post?.media, options.media || existingRecord?.media || []),
    source_file_path:
      options.source_file_path || existingRecord?.source_file_path || null,
    duplicateKey: duplicateKey || existingRecord?.duplicateKey || null,
    campaignSlug,
    ...campaignFields,
    urlWatcherEnabled: normalizeBoolean(
      options.urlWatcherEnabled,
      existingRecord?.urlWatcherEnabled ?? false
    ),
    status,
    localOnly: false,
    failure: null,
    syncedAt: now,
    publishCallback: buildPendingPublishCallback(),
  };

  const selector = existingRecord?._id
    ? { _id: existingRecord._id }
    : duplicateKey
      ? { duplicateKey }
      : { id: postId };

  await collection.updateOne(
    selector,
    { $set: document },
    { upsert: true }
  );

  clearPostsCache();

  const persistedPost = await loadStoredPost(
    document.duplicateKey ? { duplicateKey: document.duplicateKey } : { id: postId }
  );

  if (!persistedPost) {
    throw new Error("Post was created externally but not persisted locally");
  }

  return persistedPost;
}

export async function persistQueuedPostRecord(options = {}) {
  const collection = await ensurePostsCollection();
  const now = new Date().toISOString();
  const campaignSlug = normalizeCampaignSlug(options.campaignSlug);
  const duplicateKey = String(options.duplicateKey || "").trim() || null;
  const queuedPostId = resolvePostId(null, options);
  const existingRecord = await findExistingPostRecord(collection, {
    duplicateKey,
    postId: queuedPostId,
  });
  const campaignFields = buildCampaignFields({
    ...(existingRecord || {}),
    ...options,
  });
  const document = {
    ...(existingRecord || {}),
    id: existingRecord?.id || queuedPostId,
    content: String(options.content || existingRecord?.content || "").trim(),
    publish_at: options.publish_at || existingRecord?.publish_at || null,
    created_at: existingRecord?.created_at || now,
    updated_at: now,
    origin: options.origin || existingRecord?.origin || "manual",
    targets: normalizeTargets(options.targets, existingRecord?.targets || []),
    media: normalizeMedia(options.media, existingRecord?.media || []),
    source_file_path: options.source_file_path ?? existingRecord?.source_file_path ?? null,
    duplicateKey: duplicateKey || existingRecord?.duplicateKey || null,
    campaignSlug,
    ...campaignFields,
    urlWatcherEnabled: normalizeBoolean(
      options.urlWatcherEnabled,
      existingRecord?.urlWatcherEnabled ?? false
    ),
    status: "queued",
    localOnly: true,
    syncedAt: now,
    publishCallback: buildDisabledPublishCallback(),
    failure: null,
    manualJob: {
      ...(existingRecord?.manualJob || {}),
      ...(options.manualJob || {}),
    },
  };

  const selector = existingRecord?._id
    ? { _id: existingRecord._id }
    : duplicateKey
      ? { duplicateKey }
      : { id: document.id };

  await collection.updateOne(selector, { $set: document }, { upsert: true });
  clearPostsCache();

  const persistedPost = await loadStoredPost(
    document.duplicateKey ? { duplicateKey: document.duplicateKey } : { id: document.id }
  );

  if (!persistedPost) {
    throw new Error("Queued post was not persisted locally");
  }

  return persistedPost;
}

export async function persistFailedPostRecord(options = {}) {
  const collection = await ensurePostsCollection();
  const now = new Date().toISOString();
  const campaignSlug = normalizeCampaignSlug(options.campaignSlug);
  const duplicateKey = String(options.duplicateKey || "").trim() || null;
  const failedPostId =
    String(options.id || "").trim() || `failed:${randomUUID()}`;
  const existingRecord = await findExistingPostRecord(collection, {
    duplicateKey,
    postId: failedPostId,
  });

  if (
    existingRecord &&
    existingRecord.localOnly !== true &&
    !isFailedLocalOnlyPost(existingRecord)
  ) {
    clearPostsCache();
    return loadStoredPost({ _id: existingRecord._id });
  }

  const campaignFields = buildCampaignFields({
    ...(existingRecord || {}),
    ...options,
  });
  const document = {
    ...(existingRecord || {}),
    id: existingRecord?.id || failedPostId,
    content: String(options.content || existingRecord?.content || "").trim(),
    publish_at: options.publish_at || existingRecord?.publish_at || null,
    created_at: existingRecord?.created_at || now,
    updated_at: now,
    origin: options.origin || existingRecord?.origin || "bulk_queue",
    targets: normalizeTargets(options.targets, existingRecord?.targets || []),
    media: normalizeMedia(options.media, existingRecord?.media || []),
    source_file_path:
      options.source_file_path || existingRecord?.source_file_path || null,
    duplicateKey: duplicateKey || existingRecord?.duplicateKey || null,
    campaignSlug,
    ...campaignFields,
    urlWatcherEnabled: normalizeBoolean(
      options.urlWatcherEnabled,
      existingRecord?.urlWatcherEnabled ?? false
    ),
    status: "failed",
    localOnly: true,
    syncedAt: now,
    publishCallback: buildDisabledPublishCallback(),
    failure: {
      message: String(
        options.failure?.message ||
          options.error ||
          existingRecord?.failure?.message ||
          "Bulk publish failed"
      ).trim(),
      failedAt: now,
      runId: String(
        options.failure?.runId || existingRecord?.failure?.runId || ""
      ).trim() || null,
      retrySourceRunId: String(
        options.failure?.retrySourceRunId ||
          existingRecord?.failure?.retrySourceRunId ||
          ""
      ).trim() || null,
      videoName: String(
        options.failure?.videoName || existingRecord?.failure?.videoName || ""
      ).trim() || null,
      videoPath: String(
        options.failure?.videoPath || existingRecord?.failure?.videoPath || ""
      ).trim() || null,
      matchType: String(
        options.failure?.matchType || existingRecord?.failure?.matchType || ""
      ).trim() || null,
      retryAttemptCount: Math.max(
        0,
        Number(
          options.failure?.retryAttemptCount ??
            existingRecord?.failure?.retryAttemptCount ??
            0
        ) || 0
      ),
      nextRetryAt: String(
        options.failure?.nextRetryAt ||
          existingRecord?.failure?.nextRetryAt ||
          ""
      ).trim() || null,
    },
  };

  const selector = existingRecord?._id
    ? { _id: existingRecord._id }
    : duplicateKey
      ? { duplicateKey }
      : { id: document.id };

  await collection.updateOne(selector, { $set: document }, { upsert: true });
  clearPostsCache();

  const persistedPost = await loadStoredPost(
    document.duplicateKey ? { duplicateKey: document.duplicateKey } : { id: document.id }
  );

  if (!persistedPost) {
    throw new Error("Failed post was not persisted locally");
  }

  return persistedPost;
}

export async function createPost(payload) {
  try {
    startPostPublishCallbackWatcher();
    const { campaignSlug, signal, ...postoncePayload } = payload || {};
    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const campaignFields = buildCampaignFields(campaign);
    const duplicateKey = String(postoncePayload?.duplicateKey || "").trim();
    const {
      duplicateKey: _duplicateKey,
      source_file_path: _sourceFilePath,
      urlWatcherEnabled,
      ...requestBase
    } = postoncePayload;
    const requestPayload = {
      ...requestBase,
      ...(duplicateKey && !requestBase.external_id
        ? { external_id: duplicateKey }
        : {}),
      targets: buildPostOnceTargets(postoncePayload.targets),
    };
    const idempotencyKey = duplicateKey
      ? buildIdempotencyKey(requestPayload)
      : "";
    const response = await postonceClient.post("/posts", requestPayload, {
      signal,
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined,
    });

    if (!response) {
      throw new Error("Invalid API response");
    }

    return persistPostRecord(response, {
      ...postoncePayload,
      urlWatcherEnabled: normalizeBoolean(urlWatcherEnabled, false),
      campaignSlug,
      ...campaignFields,
    });
  } catch (error) {
    console.error(formatErrorForLog(error, `${LOG_PREFIX} error`));
    throw error;
  }
}
