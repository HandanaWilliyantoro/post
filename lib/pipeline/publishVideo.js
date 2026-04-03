import { uploadMediaPipeline } from "@/lib/media/uploadMedia.pipeline";
import { createPost } from "@/lib/post/createPost";

/**
 * Publish a single video
 *
 * Flow:
 * 1. Upload video → get media_id
 * 2. Create post → attach media → target account(s)
 */
export async function publishVideo({
  file,
  accountIds,
  content,
  publishAt = null,
}) {
  try {
    // 🔹 Step 1: upload media
    const mediaId = await uploadMediaPipeline(file);

    if (!mediaId) {
      throw new Error("Failed to get media_id");
    }

    // 🔹 Step 2: build targets
    const targets = accountIds.map((id) => ({
      account_id: id,
    }));

    // 🔹 Step 3: create post
    const result = await createPost({
      content,
      targets,
      media: [
        {
          media_id: mediaId,
        },
      ],
      publishAt,
    });

    return result;
  } catch (error) {
    console.error(
      "❌ publishVideo error:",
      error.response?.data || error.message
    );

    throw error;
  }
}