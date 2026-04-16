import postonceClient from "@/lib/api/postonceClient";
import { getDb } from "@/lib/db";
import { clearPostsCache, ensurePostsCollection } from "@/lib/post/queries/listPosts";

const LOG_PREFIX = "[post/updatePost]";

function getErrorDetails(error) {
  return error?.response?.data || error?.message || "Unknown error";
}

export async function updatePost(postId, payload) {
  try {
    const sanitizedId = String(postId || "").trim();

    if (!sanitizedId) {
      throw new Error("postId is required");
    }

    const response = await postonceClient.patch(`/posts/${sanitizedId}`, payload);
    const collection = await ensurePostsCollection();
    const db = await getDb();
    const now = new Date().toISOString();

    await collection.updateOne(
      { id: sanitizedId },
      {
        $set: {
          ...(payload.content !== undefined ? { content: payload.content } : {}),
          ...(payload.publish_at !== undefined
            ? { publish_at: payload.publish_at }
            : {}),
          ...(payload.media !== undefined ? { media: payload.media } : {}),
          updated_at: response?.updated_at || now,
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
    console.error(`${LOG_PREFIX} error:`, getErrorDetails(error));
    throw error;
  }
}
