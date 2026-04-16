import postonceClient from "@/lib/api/postonceClient";
import {
  clearPostsCache,
  ensurePostsCollection,
  listAllPosts,
} from "@/lib/post/queries/listPosts";

const CANCELLABLE_STATUSES = new Set(["queued", "scheduled"]);
const MAX_CANCEL_ROUNDS = Number.POSITIVE_INFINITY;
const LOG_PREFIX = "[post/cancelQueuedPosts]";

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase();
}

function getErrorReason(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Unknown error"
  );
}

function summarizePosts(posts) {
  return posts.reduce(
    (summary, post) => {
      const status = normalizeStatus(post?.status);

      if (status === "queued") {
        summary.queuedCount++;
      }

      if (status === "scheduled") {
        summary.scheduledCount++;
      }

      if (CANCELLABLE_STATUSES.has(status)) {
        summary.cancellablePosts.push(post);
      }

      return summary;
    },
    {
      queuedCount: 0,
      scheduledCount: 0,
      cancellablePosts: [],
    }
  );
}

export async function cancelPostById(postId) {
  await postonceClient.delete(`/posts/${postId}`);

  const collection = await ensurePostsCollection();
  await collection.updateOne(
    { id: postId },
    {
      $set: {
        status: "cancelled",
        updated_at: new Date().toISOString(),
      },
    }
  );

  clearPostsCache();
}

export async function cancelAllQueuedPosts() {
  const cancelledIds = [];
  const cancelledIdSet = new Set();
  const failed = [];
  const failedKeys = new Set();
  let rounds = 0;
  let totalPosts = 0;
  let queuedCount = 0;
  let scheduledCount = 0;
  let cancellableCount = 0;
  let stopReason = "unknown";

  log("process started");

  while (rounds < MAX_CANCEL_ROUNDS) {
    rounds++;
    log(`round ${rounds} started`);

    const posts = await listAllPosts();
    const {
      queuedCount: nextQueuedCount,
      scheduledCount: nextScheduledCount,
      cancellablePosts,
    } = summarizePosts(posts);

    totalPosts = posts.length;
    queuedCount = nextQueuedCount;
    scheduledCount = nextScheduledCount;
    cancellableCount = cancellablePosts.length;

    log(
      `round ${rounds} stats total=${totalPosts} queued=${queuedCount} scheduled=${scheduledCount} cancellable=${cancellableCount}`
    );

    if (cancellablePosts.length === 0) {
      stopReason = "no_cancellable_posts";
      log("no cancellable posts left, stopping");
      break;
    }

    let roundCancelled = 0;

    for (const post of cancellablePosts) {
      const postId = post?.id;

      if (!postId) {
        const failure = {
          id: null,
          reason: "Missing post id",
        };
        const failureKey = JSON.stringify(failure);

        if (!failedKeys.has(failureKey)) {
          failedKeys.add(failureKey);
          failed.push(failure);
        }

        continue;
      }

      try {
        await cancelPostById(postId);
        clearPostsCache();
        roundCancelled++;
        log(`cancelled post id=${postId} round=${rounds}`);

        if (!cancelledIdSet.has(postId)) {
          cancelledIdSet.add(postId);
          cancelledIds.push(postId);
        }
      } catch (error) {
        const failure = {
          id: postId,
          reason: getErrorReason(error),
        };
        const failureKey = JSON.stringify(failure);

        log(`failed to cancel id=${postId} reason=${failure.reason}`);

        if (!failedKeys.has(failureKey)) {
          failedKeys.add(failureKey);
          failed.push(failure);
        }
      }
    }

    if (roundCancelled === 0) {
      stopReason = "no_progress";
      log("no progress in this round, stopping");
      break;
    }

    log(`round ${rounds} completed cancelled=${roundCancelled}`);
  }

  if (rounds >= MAX_CANCEL_ROUNDS && stopReason === "unknown") {
    stopReason = "max_rounds_reached";
    log("max rounds reached, stopping");
  }

  log(
    `finished stopReason=${stopReason} rounds=${rounds} cancelled=${cancelledIds.length} failed=${failed.length}`
  );

  return {
    rounds,
    stopReason,
    totalPosts,
    queuedCount,
    scheduledCount,
    cancellableCount,
    cancelledCount: cancelledIds.length,
    failedCount: failed.length,
    cancelledIds,
    failed,
  };
}
