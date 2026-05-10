import axios from "axios";
import config from "@/config";

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (config.postPublishCallback.bearerToken) {
    headers.Authorization = `Bearer ${config.postPublishCallback.bearerToken}`;
  }
  return headers;
}

export function isCallbackDeliveryConfigured() {
  return Boolean(String(config.postPublishCallback.url || "").trim());
}

export function buildPublishedPayload(post, target) {
  return {
    postId: String(post?.id || "").trim(),
    campaignSlug: String(post?.campaignSlug || "").trim(),
    externalId: String(post?.external_id || "").trim() || null,
    instagramUrl: String(target?.platform_post_url || "").trim(),
    publishedAt: target?.scheduled_time || post?.publish_at || null,
    target: {
      accountId: target?.account_id || null,
      username: target?.username || null,
      platform: target?.platform || "instagram",
      targetPostId: target?.target_post_id || null,
      platformPostId: target?.platform_post_id || null,
      status: target?.status || null,
    },
    post: {
      content: post?.content || "",
      publishAt: post?.publish_at || null,
      media: Array.isArray(post?.media) ? post.media : [],
      origin: post?.origin || null,
    },
  };
}

export async function deliverPublishedCallback(post, target) {
  const url = String(config.postPublishCallback.url || "").trim();
  if (!url) {
    throw new Error("POST_PUBLISH_CALLBACK_URL is not configured");
  }

  const payload = buildPublishedPayload(post, target);
  await axios.post(url, payload, {
    headers: buildHeaders(),
    proxy: false,
    timeout: 15000,
  });
  return payload;
}
