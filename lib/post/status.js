const QUEUED_STATUSES = new Set(["queued", "scheduled"]);

export function getEffectivePostStatus(post, now = new Date()) {
  const status = String(post?.status || "").trim().toLowerCase();

  if (!QUEUED_STATUSES.has(status)) {
    return status || "unknown";
  }

  const publishAt = post?.publish_at ? new Date(post.publish_at) : null;
  if (
    publishAt &&
    !Number.isNaN(publishAt.getTime()) &&
    publishAt.getTime() <= now.getTime()
  ) {
    return "published";
  }

  return status || "unknown";
}

export function isQueuedLikePost(post, now = new Date()) {
  return QUEUED_STATUSES.has(getEffectivePostStatus(post, now));
}
