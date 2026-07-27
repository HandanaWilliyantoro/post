import { getDb } from "@/lib/db";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";
import { clearPostsCache, ensurePostsCollection } from "@/lib/post/queries/listPosts";
import { updateSocialPost } from "@/lib/postforme/posts";

const LOG_PREFIX = "[post/updatePost]";

export async function updatePost(postId, payload) {
  try {
    const sanitizedId = String(postId || "").trim();

    if (!sanitizedId) {
      throw new Error("postId is required");
    }

    const collection = await ensurePostsCollection();
    const db = await getDb();
    const now = new Date().toISOString();
    const existingPost = await collection.findOne(
      { id: sanitizedId },
      { projection: { _id: 0 } }
    );
    let providerPost = null;

    if (existingPost && existingPost.localOnly !== true) {
      providerPost = await updateSocialPost(sanitizedId, {
        content: payload.content ?? existingPost.content ?? "",
        publish_at: payload.publish_at ?? existingPost.publish_at,
        external_id:
          existingPost.external_id || existingPost.duplicateKey || undefined,
        media: payload.media ?? existingPost.media ?? [],
        origin: existingPost.origin || "postforme",
        source_file_path:
          payload.source_file_path ?? existingPost.source_file_path ?? null,
        targets: existingPost.targets || [],
      });
    }

    await collection.updateOne(
      { id: sanitizedId },
      {
        $set: {
          ...(providerPost?.content !== undefined
            ? { content: providerPost.content }
            : payload.content !== undefined
              ? { content: payload.content }
              : {}),
          ...(providerPost?.external_id !== undefined
            ? { external_id: providerPost.external_id }
            : {}),
          ...(providerPost?.publish_at !== undefined
            ? { publish_at: providerPost.publish_at }
            : payload.publish_at !== undefined
              ? { publish_at: payload.publish_at }
              : {}),
          ...(providerPost?.media !== undefined
            ? { media: providerPost.media }
            : payload.media !== undefined
              ? { media: payload.media }
              : {}),
          ...(providerPost?.scheduled_at !== undefined
            ? { scheduled_at: providerPost.scheduled_at }
            : {}),
          ...(providerPost?.status !== undefined
            ? { status: providerPost.status }
            : {}),
          ...(providerPost?.targets !== undefined
            ? { targets: providerPost.targets }
            : {}),
          ...(providerPost ? { localOnly: false } : {}),
          ...(payload.source_file_path !== undefined
            ? { source_file_path: payload.source_file_path }
            : {}),
          updated_at: now,
          syncedAt: now,
        },
      }
    );

    clearPostsCache();

    return db.collection("posts").findOne(
      { id: sanitizedId },
      { projection: { _id: 0 } }
    );
  } catch (error) {
    console.error(formatErrorForLog(error, `${LOG_PREFIX} error`));
    throw error;
  }
}
