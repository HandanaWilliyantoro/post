require("dotenv").config({ quiet: true });

const axios = require("axios");
const { MongoClient } = require("mongodb");
const path = require("path");

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/^@+/, "");
}

function normalizePublishAt(value) {
  return String(value || "").trim();
}

function getPostTargets(post) {
  return Array.isArray(post?.targets) ? post.targets : [];
}

function getPostUsernames(post) {
  return [...new Set(
    getPostTargets(post)
      .map((target) =>
        normalizeUsername(
          target?.username || target?.account_id || target?.id || ""
        )
      )
      .filter(Boolean)
  )].sort();
}

function buildTargetSignature(post) {
  return getPostUsernames(post).join(",");
}

function getCreatedAtMs(post) {
  const parsed = Date.parse(String(post?.created_at || "").trim());
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function getPublishAtMs(post) {
  const parsed = Date.parse(String(post?.publish_at || "").trim());
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function getStatusPriority(post) {
  const status = String(post?.status || "").trim().toLowerCase();

  if (post?.localOnly === true && status === "failed") {
    return 4;
  }

  if (post?.localOnly === true) {
    return 3;
  }

  if (status === "failed") {
    return 2;
  }

  if (status === "cancelled") {
    return 1;
  }

  return 0;
}

function comparePostsForKeep(left, right) {
  const priorityDelta = getStatusPriority(left) - getStatusPriority(right);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const targetCountDelta =
    getPostUsernames(right).length - getPostUsernames(left).length;

  if (targetCountDelta !== 0) {
    return targetCountDelta;
  }

  const createdAtDelta = getCreatedAtMs(left) - getCreatedAtMs(right);

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function buildSafeGroupKey(post) {
  const publishAt = normalizePublishAt(post?.publish_at);
  const signature = buildTargetSignature(post);

  if (!publishAt || !signature) {
    return "";
  }

  return `${publishAt}|${signature}`;
}

function buildUsernameSlotKey(username, publishAt) {
  if (!username || !publishAt) {
    return "";
  }

  return `${publishAt}|${username}`;
}

function buildSourceKey(post) {
  return String(post?.source_file_path || "").trim();
}

function groupBy(items, getKey) {
  const groups = new Map();

  for (const item of items) {
    const key = getKey(item);

    if (!key) {
      continue;
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  }

  return groups;
}

function toSerializablePost(post) {
  return {
    id: String(post?.id || "").trim() || null,
    campaignSlug: String(post?.campaignSlug || "").trim() || null,
    publish_at: normalizePublishAt(post?.publish_at) || null,
    created_at: String(post?.created_at || "").trim() || null,
    status: String(post?.status || "").trim() || null,
    localOnly: post?.localOnly === true,
    usernames: getPostUsernames(post),
    source_file_path: String(post?.source_file_path || "").trim() || null,
    source_file_name: path.basename(String(post?.source_file_path || "").trim() || ""),
  };
}

function comparePostsByTimeline(left, right) {
  const publishAtDelta = getPublishAtMs(left) - getPublishAtMs(right);

  if (publishAtDelta !== 0) {
    return publishAtDelta;
  }

  const createdAtDelta = getCreatedAtMs(left) - getCreatedAtMs(right);

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function buildUsernameSlotCleanupPlan(posts) {
  const plannedById = new Map();
  const safeGroups = [];
  const skippedGroups = [];
  const remainingIds = new Set(posts.map((post) => String(post?.id || "").trim()));

  const safeDuplicateGroups = [...groupBy(posts, buildSafeGroupKey).entries()].filter(
    ([, group]) => group.length > 1
  );

  for (const [key, group] of safeDuplicateGroups) {
    const sorted = [...group].sort(comparePostsForKeep);
    const keep = sorted[0];
    const remove = sorted.slice(1);

    safeGroups.push({
      key,
      keep: toSerializablePost(keep),
      remove: remove.map(toSerializablePost),
    });

    for (const post of remove) {
      const postId = String(post?.id || "").trim();

      plannedById.set(postId, {
        post,
        reason: "same usernames and publish_at",
        groupKey: key,
      });
      remainingIds.delete(postId);
    }
  }

  const remainingPosts = posts.filter((post) =>
    remainingIds.has(String(post?.id || "").trim())
  );
  const perUsernameGroups = new Map();

  for (const post of remainingPosts) {
    const publishAt = normalizePublishAt(post?.publish_at);

    for (const username of getPostUsernames(post)) {
      const key = buildUsernameSlotKey(username, publishAt);

      if (!perUsernameGroups.has(key)) {
        perUsernameGroups.set(key, []);
      }

      perUsernameGroups.get(key).push(post);
    }
  }

  for (const [key, group] of perUsernameGroups.entries()) {
    if (group.length <= 1) {
      continue;
    }

    const signatures = [...new Set(group.map(buildTargetSignature))];

    if (signatures.length <= 1) {
      continue;
    }

    skippedGroups.push({
      key,
      reason: "overlapping multi-target posts require manual review",
      posts: group
        .map(toSerializablePost)
        .sort((left, right) =>
          String(left?.id || "").localeCompare(String(right?.id || ""))
        ),
    });
  }

  return {
    mode: "username-slot",
    safeGroups,
    skippedGroups,
    removals: [...plannedById.values()],
  };
}

function buildSourceCleanupPlan(posts) {
  const livePosts = posts.filter(
    (post) =>
      post?.localOnly !== true && String(post?.source_file_path || "").trim()
  );
  const sourceGroups = [...groupBy(livePosts, buildSourceKey).entries()].filter(
    ([, group]) => group.length > 1
  );
  const plannedById = new Map();
  const duplicateGroups = [];
  const reportedOnlyGroups = [];

  for (const [key, group] of sourceGroups) {
    const publishedPosts = group
      .filter((post) => String(post?.status || "").trim().toLowerCase() === "published")
      .sort(comparePostsByTimeline);
    const keep = (publishedPosts[0] || [...group].sort(comparePostsByTimeline)[0]) || null;

    if (!keep) {
      continue;
    }

    const removable = [];
    const reportedOnly = [];

    for (const post of group) {
      if (String(post?.id || "").trim() === String(keep?.id || "").trim()) {
        continue;
      }

      const status = String(post?.status || "").trim().toLowerCase();

      if (status === "scheduled") {
        removable.push(post);
        plannedById.set(String(post?.id || "").trim(), {
          post,
          reason: "same source video reused across multiple live posts",
          groupKey: key,
        });
        continue;
      }

      reportedOnly.push(post);
    }

    duplicateGroups.push({
      key,
      keep: toSerializablePost(keep),
      removable: removable.map(toSerializablePost),
      reportedOnly: reportedOnly.map(toSerializablePost),
    });

    if (reportedOnly.length) {
      reportedOnlyGroups.push({
        key,
        keep: toSerializablePost(keep),
        duplicates: reportedOnly.map(toSerializablePost),
        reason: "published duplicates were detected and left untouched",
      });
    }
  }

  return {
    mode: "source",
    duplicateGroups,
    reportedOnlyGroups,
    removals: [...plannedById.values()],
  };
}

function buildCleanupPlan(posts, mode) {
  if (mode === "source") {
    return buildSourceCleanupPlan(posts);
  }

  return buildUsernameSlotCleanupPlan(posts);
}

function buildPostonceClient() {
  const baseURL = String(process.env.POSTONCE_BASE_URL || "").trim();
  const apiKey = String(process.env.POSTONCE_API_KEY || "").trim();

  if (!baseURL || !apiKey) {
    throw new Error("POSTONCE credentials are not configured");
  }

  return axios.create({
    baseURL,
    proxy: false,
    timeout: 45000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

async function cancelRemotePost(client, postId) {
  try {
    await client.delete(`/posts/${postId}`);
    return { cancelled: true, alreadyMissing: false, error: null };
  } catch (error) {
    const status = Number(error?.response?.status || 0);

    if (status === 404) {
      return { cancelled: false, alreadyMissing: true, error: null };
    }

    return {
      cancelled: false,
      alreadyMissing: false,
      error:
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to cancel remote post",
    };
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const modeArg = process.argv.find((value) => value.startsWith("--mode="));
  const mode = String(modeArg ? modeArg.slice("--mode=".length) : "username-slot").trim() || "username-slot";
  const mongoUri = String(process.env.MONGODB_URI || "").trim();
  const dbName = String(process.env.MONGODB_DB || "development").trim();

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();

  try {
    const db = mongo.db(dbName);
    const collection = db.collection("posts");
    const posts = await collection
      .find({})
      .project({
        _id: 0,
        id: 1,
        publish_at: 1,
        created_at: 1,
        status: 1,
        localOnly: 1,
        campaignSlug: 1,
        source_file_path: 1,
        targets: 1,
      })
      .toArray();

    const plan = buildCleanupPlan(posts, mode);
    const summary = mode === "source" ? {
      apply,
      mode,
      totalPosts: posts.length,
      livePosts: posts.filter((post) => post?.localOnly !== true).length,
      duplicateSourceGroups: plan.duplicateGroups.length,
      removableScheduledDuplicates: plan.removals.length,
      reportedOnlyPublishedDuplicates: plan.reportedOnlyGroups.reduce(
        (count, group) => count + group.duplicates.length,
        0
      ),
      sampleGroups: plan.duplicateGroups.slice(0, 10),
      sampleReportedOnlyGroups: plan.reportedOnlyGroups.slice(0, 10),
      removedPosts: [],
      failedRemovals: [],
    } : {
      apply,
      mode,
      totalPosts: posts.length,
      safeDuplicateGroups: plan.safeGroups.length,
      skippedGroups: plan.skippedGroups.length,
      removablePosts: plan.removals.length,
      sampleSafeGroups: plan.safeGroups.slice(0, 10),
      sampleSkippedGroups: plan.skippedGroups.slice(0, 10),
      removedPosts: [],
      failedRemovals: [],
    };

    if (!apply || !plan.removals.length) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const postonceClient = buildPostonceClient();

    for (const item of plan.removals) {
      const postId = String(item?.post?.id || "").trim();

      if (!postId) {
        continue;
      }

      const isLocalOnly = item?.post?.localOnly === true;

      if (!isLocalOnly) {
        const cancellation = await cancelRemotePost(postonceClient, postId);

        if (cancellation.error) {
          summary.failedRemovals.push({
            id: postId,
            reason: item.reason,
            groupKey: item.groupKey,
            error: cancellation.error,
          });
          continue;
        }
      }

      await collection.deleteOne({ id: postId });
      summary.removedPosts.push({
        id: postId,
        localOnly: isLocalOnly,
        reason: item.reason,
        groupKey: item.groupKey,
      });
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
