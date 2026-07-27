import postformeClient from "@/lib/api/postformeClient";
import { resolvePostMedia } from "@/lib/postforme/media";

function normalizeText(value) {
  return String(value || "").trim();
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isPostIdArrayValidationError(error) {
  const message = normalizeText(error?.message).toLowerCase();
  const responseMessage = normalizeText(
    error?.response?.data?.message || error?.response?.data?.error
  ).toLowerCase();
  const fullMessage = `${message} ${responseMessage}`;

  return fullMessage.includes("post_id") && fullMessage.includes("string");
}

function buildSocialPostResultsParams(ids, { limit, offset }) {
  const params = new URLSearchParams();

  params.set("limit", String(limit));
  params.set("offset", String(offset));

  for (const id of ids) {
    params.append("post_id", id);
  }

  return params;
}

function appendQueryValues(params, name, value) {
  const values = Array.isArray(value) ? value : [value];

  for (const item of values) {
    const normalized = normalizeText(item);

    if (normalized) {
      params.append(name, normalized);
    }
  }
}

function buildSocialPostsParams(options = {}, { limit, offset }) {
  const params = new URLSearchParams();

  params.set("limit", String(limit));
  params.set("offset", String(offset));
  appendQueryValues(params, "platform", options.platform);
  appendQueryValues(params, "status", options.status);
  appendQueryValues(
    params,
    "external_id",
    options.external_id ?? options.externalId
  );
  appendQueryValues(
    params,
    "social_account_id",
    options.social_account_id ?? options.socialAccountId
  );

  return params;
}

function normalizeTargetId(target) {
  if (!target || typeof target !== "object") {
    return "";
  }

  return String(target.account_id || target.id || "").trim();
}

export function buildSocialAccountIds(targets = []) {
  if (!Array.isArray(targets)) {
    return [];
  }

  return [
    ...new Set(
      targets
        .map(normalizeTargetId)
        .filter(Boolean)
    ),
  ];
}

function normalizeRemoteMedia(media, fallback = []) {
  return Array.isArray(media) && media.length
    ? media.map((item, index) => ({
        ...item,
        type: item?.type || fallback?.[index]?.type || inferMediaType(item?.url),
      }))
    : fallback;
}

function inferMediaType(value) {
  const normalized = String(value || "").split("?")[0].toLowerCase();
  return /\.(png|jpe?g)$/i.test(normalized) ? "image" : "video";
}

function buildProviderMedia(media = []) {
  return media.map(({ type: _type, ...item }) => item);
}

function normalizeRemoteTargets(accounts = [], fallback = []) {
  if (!Array.isArray(accounts) || !accounts.length) {
    return Array.isArray(fallback) ? fallback : [];
  }

  return accounts.map((account) => ({
    account_id: String(account?.id || account?.account_id || "").trim(),
    username: normalizeText(account?.username),
    avatar_url: normalizeText(
      account?.profile_photo_url || account?.avatar_url || account?.avatarUrl
    ),
    platform: normalizeText(account?.platform),
    platform_post_id: normalizeText(
      account?.platform_post_id ||
        account?.external_post_id ||
        account?.post_id
    ) || null,
    platform_post_url: normalizeText(
      account?.platform_post_url ||
        account?.platform_url ||
        account?.permalink ||
        account?.post_url ||
        account?.share_url
    ) || null,
    status: normalizeText(account?.status),
  }));
}

export function normalizeSocialPost(remotePost, fallback = {}) {
  const scheduledAt =
    remotePost?.scheduled_at ??
    remotePost?.publish_at ??
    fallback?.publish_at ??
    null;

  return {
    ...(fallback || {}),
    ...(remotePost || {}),
    id: normalizeText(remotePost?.id || fallback?.id),
    content: remotePost?.caption ?? fallback?.content ?? "",
    external_id:
      remotePost?.external_id ??
      fallback?.external_id ??
      null,
    media: normalizeRemoteMedia(remotePost?.media, fallback?.media || []),
    origin: fallback?.origin || remotePost?.origin || "postforme",
    publish_at: scheduledAt,
    scheduled_at: scheduledAt,
    status: normalizeText(remotePost?.status || fallback?.status || "scheduled"),
    targets: normalizeRemoteTargets(
      remotePost?.social_accounts,
      fallback?.targets || []
    ),
    postResults: Array.isArray(remotePost?.postResults)
      ? remotePost.postResults
      : Array.isArray(remotePost?.post_results)
        ? remotePost.post_results
        : Array.isArray(remotePost?.results)
          ? remotePost.results
          : fallback?.postResults,
  };
}

function buildSocialPostPayload(payload = {}, options = {}) {
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const socialAccounts = buildSocialAccountIds(targets);
  const caption = normalizeText(payload.content || payload.caption);

  if (!caption) {
    throw new Error("Post caption is required");
  }

  if (!socialAccounts.length) {
    throw new Error("At least one PostForMe social account is required");
  }

  return {
    caption,
    ...(payload.publish_at || payload.scheduled_at
      ? { scheduled_at: payload.publish_at || payload.scheduled_at }
      : {}),
    ...(options.media?.length ? { media: options.media } : {}),
    social_accounts: socialAccounts,
    ...(payload.external_id ? { external_id: payload.external_id } : {}),
    ...(payload.platform_configurations
      ? { platform_configurations: payload.platform_configurations }
      : {}),
    ...(payload.account_configurations
      ? { account_configurations: payload.account_configurations }
      : {}),
    ...(payload.isDraft !== undefined ? { isDraft: Boolean(payload.isDraft) } : {}),
  };
}

export async function createSocialPost(payload = {}, options = {}) {
  const media = await resolvePostMedia(payload.media, {
    signal: options.signal,
    sourceFilePath: payload.source_file_path,
  });
  const requestPayload = buildSocialPostPayload(payload, {
    media: buildProviderMedia(media),
  });
  const remotePost = await postformeClient.post("/social-posts", requestPayload, {
    signal: options.signal,
  });

  return {
    media,
    requestPayload,
    post: normalizeSocialPost(remotePost, {
      ...payload,
      media,
      targets: payload.targets,
    }),
  };
}

export async function getSocialPost(postId, options = {}) {
  const id = normalizeText(postId);

  if (!id) {
    throw new Error("postId is required");
  }

  const remotePost = await postformeClient.get(
    `/social-posts/${encodeURIComponent(id)}`,
    { signal: options.signal }
  );

  return normalizeSocialPost(remotePost, options.fallback || {});
}

export async function listSocialPosts(options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 50) || 50));
  let offset = Math.max(0, Number(options.offset || 0) || 0);
  const maxPages = Math.max(
    1,
    Math.min(1000, Number(options.maxPages || 100) || 100)
  );
  const posts = [];

  for (let page = 0; page < maxPages; page += 1) {
    const response = await postformeClient.get("/social-posts", {
      params: buildSocialPostsParams(options, { limit, offset }),
      suppressErrorLog: Boolean(options.suppressErrorLog),
      signal: options.signal,
    });
    const items = Array.isArray(response?.data) ? response.data : [];

    posts.push(...items.map((post) => normalizeSocialPost(post)));

    if (!items.length || !response?.meta?.next) {
      break;
    }

    offset += items.length;
  }

  return posts;
}

export async function listLatestSocialPostResults(options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 100) || 100));
  const offset = Math.max(0, Number(options.offset || 0) || 0);
  const response = await postformeClient.get("/social-post-results", {
    params: buildSocialPostResultsParams([], { limit, offset }),
    suppressErrorLog: Boolean(options.suppressErrorLog),
    signal: options.signal,
  });

  return Array.isArray(response?.data) ? response.data : [];
}

export async function updateSocialPost(postId, payload = {}, options = {}) {
  const id = normalizeText(postId);

  if (!id) {
    throw new Error("postId is required");
  }

  const media = await resolvePostMedia(payload.media, {
    signal: options.signal,
    sourceFilePath: payload.source_file_path,
  });
  const requestPayload = buildSocialPostPayload(payload, {
    media: buildProviderMedia(media),
  });
  const remotePost = await postformeClient.put(
    `/social-posts/${encodeURIComponent(id)}`,
    requestPayload,
    { signal: options.signal }
  );

  return normalizeSocialPost(remotePost, {
    ...payload,
    id,
    media,
    targets: payload.targets,
  });
}

export async function deleteSocialPost(postId, options = {}) {
  const id = normalizeText(postId);

  if (!id) {
    throw new Error("postId is required");
  }

  return postformeClient.delete(`/social-posts/${encodeURIComponent(id)}`, {
    signal: options.signal,
  });
}

export async function listSocialPostResults(postId, options = {}) {
  const ids = [
    ...new Set(
      (Array.isArray(postId) ? postId : [postId])
        .map(normalizeText)
        .filter(Boolean)
    ),
  ];

  if (!ids.length) {
    return [];
  }

  const limit = Math.max(1, Math.min(100, Number(options.limit || 100) || 100));
  let offset = Math.max(0, Number(options.offset || 0) || 0);
  const results = [];

  for (let page = 0; page < 100; page += 1) {
    let response;

    try {
      response = await postformeClient.get("/social-post-results", {
        params: buildSocialPostResultsParams(ids, { limit, offset }),
        suppressErrorLog: Boolean(options.suppressErrorLog),
        signal: options.signal,
      });
    } catch (error) {
      if (ids.length <= 1 || !isPostIdArrayValidationError(error)) {
        throw error;
      }

      const fallbackResults = [];
      const fallbackDelayMs = Math.max(
        0,
        Number(options.fallbackDelayMs || 0) || 0
      );

      for (const id of ids) {
        fallbackResults.push(
          ...(await listSocialPostResults(id, {
            ...options,
            fallbackDelayMs: 0,
          }))
        );

        if (fallbackDelayMs) {
          await wait(fallbackDelayMs);
        }
      }

      return fallbackResults;
    }

    const items = Array.isArray(response?.data) ? response.data : [];

    results.push(...items);

    if (!items.length || !response?.meta?.next) {
      break;
    }

    offset += items.length;
  }

  return results;
}

export async function getSocialPostResult(resultId, options = {}) {
  const id = normalizeText(resultId);

  if (!id) {
    throw new Error("resultId is required");
  }

  return postformeClient.get(
    `/social-post-results/${encodeURIComponent(id)}`,
    {
      suppressErrorLog: Boolean(options.suppressErrorLog),
      signal: options.signal,
    }
  );
}
