import config from "@/config";
import { createPost } from "@/lib/post";
import { uploadMediaPipeline } from "@/lib/media/uploadMedia.pipeline";
import {
  buildPostDuplicateKey,
  findDuplicatePost,
} from "@/lib/post/duplicateGuard";
import {
  cleanupVideoVariantContext,
  cleanupVideoVariant,
  createVideoVariant,
  createVideoVariantContext,
} from "@/lib/video/variantPipeline";

function buildTarget(target) {
  return {
    account_id: target.id,
    username: target.username || "",
    platform: target.platform || "",
    status: target.status || "",
  };
}

async function mapWithConcurrency(items, concurrency, iteratee) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const currentIndex = index;
      index += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );

  return results;
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

async function createSharedPost({
  campaign,
  accounts,
  content,
  titleVariants,
  publishAt,
  sourceFile,
  sourceFilePath,
  origin,
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

  const uploaded = await uploadMediaPipeline(sourceFile);

  if (!uploaded?.media_id) {
    throw new Error("Upload failed: no media_id");
  }

  return createPost({
    content,
    publish_at: publishAt,
    campaignSlug: campaign.slug,
    duplicateKey,
    source_file_path: sourceFilePath || sourceFile?.path || null,
    origin: origin || "manual",
    targets,
    media: [
      {
        url: uploaded.url,
        type: "video",
      },
    ],
  });
}

async function createAutoScanPosts({
  campaign,
  accounts,
  content,
  titleVariants,
  publishAt,
  sourceFile,
  sourceFilePath,
  origin,
}) {
  const context = await createVideoVariantContext(
    sourceFile.path,
    accounts.length,
    titleVariants
  );
  const concurrency = Number(config.videoEditing.variantConcurrency || 2);

  try {
    await assertNoDuplicateForTargets({
      campaignSlug: campaign.slug,
      content,
      publishAt,
      targets: accounts,
    });
    const createdPosts = await mapWithConcurrency(
      accounts,
      concurrency,
      async (account, index) => {
        const variant = await createVideoVariant({
          sourceFile,
          context,
          variantIndex: index,
          variantKey: `${campaign.slug}:${account.id}:${publishAt}:${index}`,
        });

        try {
          const uploaded = await uploadMediaPipeline(variant.file);
          const targets = [buildTarget(account)];
          const duplicateKey = buildPostDuplicateKey({
            campaignSlug: campaign.slug,
            content,
            publish_at: publishAt,
            targets,
          });

          return createPost({
            content,
            publish_at: publishAt,
            campaignSlug: campaign.slug,
            duplicateKey,
            source_file_path: sourceFilePath || sourceFile?.path || null,
            origin: origin || "manual",
            targets,
            media: [
              {
                url: uploaded.url,
                type: "video",
              },
            ],
          });
        } finally {
          cleanupVideoVariant(variant);
        }
      }
    );

    return {
      posts: createdPosts,
      variantMetadata: context,
    };
  } finally {
    cleanupVideoVariantContext(context);
  }
}

export async function scheduleVideoPosts({
  campaign,
  accounts,
  content,
  titleVariants,
  publishAt,
  sourceFile,
  sourceFilePath,
  origin,
}) {
  if (campaign?.campaignType === "auto-scan") {
    return createAutoScanPosts({
      campaign,
      accounts,
      content,
      titleVariants,
      publishAt,
      sourceFile,
      sourceFilePath,
      origin,
    });
  }

  const result = await createSharedPost({
    campaign,
    accounts,
    content,
    titleVariants,
    publishAt,
    sourceFile,
    sourceFilePath,
    origin,
  });

  if (result?.posts) {
    return result;
  }

  return {
    posts: [result],
    variantMetadata: null,
  };
}
