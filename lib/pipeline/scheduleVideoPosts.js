import { createPost } from "@/lib/post";
import { uploadMediaPipeline } from "@/lib/media/uploadMedia.pipeline";
import {
  buildPostDuplicateKey,
  findDuplicatePost,
} from "@/lib/post/duplicateGuard";

function buildTarget(target) {
  return {
    account_id: target.id,
    username: target.username || "",
    platform: target.platform || "",
    status: target.status || "",
  };
}

async function assertNoDuplicateForTargets({
  campaignSlug,
  content,
  publishAt,
  targets,
}) {
  for (const target of targets) {
    const duplicateKey = buildPostDuplicateKey({
      campaignSlug,
      content,
      publish_at: publishAt,
      targets: [buildTarget(target)],
    });
    const existing = await findDuplicatePost(duplicateKey);

    if (existing) {
      throw new Error(
        `A post is already scheduled for account ${target.id} at that time`
      );
    }
  }
}

async function uploadSourceMedia(sourceFile, signal) {
  const uploaded = await uploadMediaPipeline(sourceFile, { signal });

  if (!uploaded?.media_id) {
    throw new Error("Upload failed: no media_id");
  }

  return uploaded;
}

async function createSharedPost({
  campaign,
  accounts,
  content,
  publishAt,
  sourceFile,
  sourceFilePath,
  origin,
  signal,
}) {
  const targets = accounts.map(buildTarget);
  const duplicateKey = buildPostDuplicateKey({
    campaignSlug: campaign.slug,
    content,
    publish_at: publishAt,
    targets,
  });
  const duplicatePost = await findDuplicatePost(duplicateKey);

  if (duplicatePost) {
    throw new Error(
      "This post is already scheduled for that campaign, target set, and publish time"
    );
  }

  const uploaded = await uploadSourceMedia(sourceFile, signal);
  const post = await createPost({
    content,
    publish_at: publishAt,
    campaignSlug: campaign.slug,
    duplicateKey,
    source_file_path: sourceFilePath || sourceFile?.path || null,
    origin: origin || "manual",
    signal,
    targets,
    media: [
      {
        url: uploaded.url,
        type: "video",
      },
    ],
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
  signal,
}) {
  await assertNoDuplicateForTargets({
    campaignSlug: campaign.slug,
    content,
    publishAt,
    targets: accounts,
  });

  const uploaded = await uploadSourceMedia(sourceFile, signal);
  const createdPosts = [];

  for (const account of accounts) {
    const targets = [buildTarget(account)];
    const duplicateKey = buildPostDuplicateKey({
      campaignSlug: campaign.slug,
      content,
      publish_at: publishAt,
      targets,
    });

    const post = await createPost({
      content,
      publish_at: publishAt,
      campaignSlug: campaign.slug,
      duplicateKey,
      source_file_path: sourceFilePath || sourceFile?.path || null,
      origin: origin || "manual",
      signal,
      targets,
      media: [
        {
          url: uploaded.url,
          type: "video",
        },
      ],
    });

    createdPosts.push(post);
  }

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
