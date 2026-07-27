import os from "os";
import path from "path";

import { createPost } from "@/lib/post";
import {
  buildPostDuplicateKey,
  findDuplicatePost,
  isBlockingDuplicatePost,
} from "@/lib/post/duplicateGuard";
import { buildStoredPostTarget } from "@/lib/post/targets";

function buildTarget(target) {
  return buildStoredPostTarget(target);
}

function buildSourceDuplicateKey(sourceFile, sourceFilePath) {
  return (
    String(sourceFile?.name || "").trim() ||
    path.basename(String(sourceFilePath || sourceFile?.path || "").trim())
  );
}

const CPU_COUNT = Math.max(1, os.cpus()?.length || 1);
const DEFAULT_ACCOUNT_POST_CONCURRENCY = Math.max(
  1,
  Math.min(8, CPU_COUNT)
);
const ACCOUNT_POST_CONCURRENCY = Math.max(
  1,
  Number(
    process.env.BULK_PUBLISH_ACCOUNT_POST_CONCURRENCY ||
      DEFAULT_ACCOUNT_POST_CONCURRENCY
  ) || DEFAULT_ACCOUNT_POST_CONCURRENCY
);

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

async function assertNoDuplicateForTargets({
  campaignSlug,
  content,
  publishAt,
  targets,
  sourceKey,
}) {
  await mapWithConcurrency(
    targets,
    ACCOUNT_POST_CONCURRENCY,
    async (target) => {
      const duplicateKey = buildPostDuplicateKey({
        campaignSlug,
        content,
        publish_at: publishAt,
        targets: [buildTarget(target)],
        sourceKey,
      });
      const existing = await findDuplicatePost(duplicateKey);

      if (isBlockingDuplicatePost(existing)) {
        throw new Error(
          `A post is already scheduled for account ${target.id} at that time`
        );
      }
    }
  );
}

function buildSourceMedia(sourceFile, sourceFilePath) {
  const mediaUrl = String(sourceFilePath || sourceFile?.path || "").trim();

  if (!mediaUrl) {
    throw new Error("Source video path is required");
  }

  return {
    url: mediaUrl,
    type: "video",
  };
}

async function createSharedPost({
  campaign,
  accounts,
  content,
  publishAt,
  sourceFile,
  sourceFilePath,
  origin,
  urlWatcherEnabled,
  signal,
}) {
  const targets = accounts.map(buildTarget);
  const sourceKey = buildSourceDuplicateKey(sourceFile, sourceFilePath);
  const duplicateKey = buildPostDuplicateKey({
    campaignSlug: campaign.slug,
    content,
    publish_at: publishAt,
    targets,
    sourceKey,
  });
  const duplicatePost = await findDuplicatePost(duplicateKey);

  if (isBlockingDuplicatePost(duplicatePost)) {
    throw new Error(
      "This post is already scheduled for that campaign, target set, and publish time"
    );
  }

  const media = buildSourceMedia(sourceFile, sourceFilePath);
  const post = await createPost({
    content,
    publish_at: publishAt,
    campaignSlug: campaign.slug,
    duplicateKey,
    source_file_path: sourceFilePath || sourceFile?.path || null,
    origin: origin || "manual",
    urlWatcherEnabled,
    signal,
    targets,
    media: [media],
  });

  return {
    post,
    variantMetadata: null,
  };
}

async function createAutoScanPosts({
  campaign,
  accounts,
  content,
  publishAt,
  sourceFile,
  sourceFilePath,
  origin,
  urlWatcherEnabled,
  signal,
}) {
  await assertNoDuplicateForTargets({
    campaignSlug: campaign.slug,
    content,
    publishAt,
    targets: accounts,
    sourceKey: buildSourceDuplicateKey(sourceFile, sourceFilePath),
  });

  const media = buildSourceMedia(sourceFile, sourceFilePath);
  const createdPosts = await mapWithConcurrency(
    accounts,
    ACCOUNT_POST_CONCURRENCY,
    async (account) => {
      const targets = [buildTarget(account)];
      const duplicateKey = buildPostDuplicateKey({
        campaignSlug: campaign.slug,
        content,
        publish_at: publishAt,
        targets,
        sourceKey: buildSourceDuplicateKey(sourceFile, sourceFilePath),
      });

      const post = await createPost({
        content,
        publish_at: publishAt,
        campaignSlug: campaign.slug,
        duplicateKey,
        source_file_path: sourceFilePath || sourceFile?.path || null,
        origin: origin || "manual",
        urlWatcherEnabled,
        signal,
        targets,
        media: [media],
      });
      return post;
    }
  );

  return {
    posts: createdPosts,
    variantMetadata: null,
  };
}

export async function scheduleVideoPosts({
  campaign,
  accounts,
  content,
  publishAt,
  sourceFile,
  sourceFilePath,
  origin,
  urlWatcherEnabled,
  signal,
}) {
  if (campaign?.campaignType === "auto-scan") {
    return createAutoScanPosts({
      campaign,
      accounts,
      content,
      publishAt,
      sourceFile,
      sourceFilePath,
      origin,
      urlWatcherEnabled,
      signal,
    });
  }

  const result = await createSharedPost({
    campaign,
    accounts,
    content,
    publishAt,
    sourceFile,
    sourceFilePath,
    origin,
    urlWatcherEnabled,
    signal,
  });

  if (result?.posts) {
    return result;
  }

  return {
    posts: [result?.post || result],
    variantMetadata: result?.variantMetadata || null,
  };
}
