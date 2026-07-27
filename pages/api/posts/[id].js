import { getPostById, updatePost } from "@/lib/post";
import {
  mergePostDetails,
  removeLocalPost,
  replacePostWithNewVideo,
} from "@/lib/post/api/postDetails";
import {
  cleanupManualPostSourceFile,
  isQueuedManualPost,
  retryFailedPost,
} from "@/lib/post/manualPostQueue";
import { startPostPublishCallbackWatcher } from "@/lib/post/publishCallbackWatcher";
import { parsePostPatchPayload } from "@/lib/post/api/requestParsers";
import { deleteSocialPost } from "@/lib/postforme/posts";

export const config = {
  api: { bodyParser: false },
};

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;
}

export default async function handler(req, res) {
  startPostPublishCallbackWatcher();
  const postId = String(req.query?.id || "").trim();
  if (!postId) return res.status(400).json({ success: false, error: "id is required" });

  if (req.method === "GET") {
    try {
      const localPost = await getPostById(postId);
      if (!localPost) return res.status(404).json({ success: false, error: "Post not found" });
      return res.status(200).json({ success: true, data: localPost });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method === "POST") {
    try {
      const queuedPost = await retryFailedPost(postId);

      return res.status(202).json({
        success: true,
        data: queuedPost,
        message: "Failed post queued for retry",
      });
    } catch (error) {
      const message = errorMessage(error, "Failed to retry post");
      const statusCode = message.includes("not found")
        ? 404
        : message.includes("already queued")
          ? 409
          : message.includes("Only failed") ||
              message.includes("missing") ||
              message.includes("source video")
            ? 400
            : 500;

      return res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  }

  if (req.method === "DELETE") {
    try {
      const existingPost = await getPostById(postId);

      if (isQueuedManualPost(existingPost)) {
        return res.status(409).json({
          success: false,
          error:
            "Background manual posts cannot be deleted while they are queued or processing",
        });
      }

      if (existingPost?.localOnly === true) {
        await cleanupManualPostSourceFile(existingPost);
        await removeLocalPost(postId);
        return res.status(200).json({ success: true, id: postId, localOnly: true });
      }

      if (existingPost) {
        try {
          await deleteSocialPost(postId);
        } catch (error) {
          const status = Number(error?.response?.status || 0);
          if (status !== 404) {
            throw error;
          }
        }
      }

      await removeLocalPost(postId);
      return res.status(200).json({ success: true, id: postId });
    } catch (error) {
      return res.status(500).json({ success: false, error: errorMessage(error, "Failed to delete post") });
    }
  }

  if (req.method === "PATCH") {
    try {
      const existingPost = await getPostById(postId);
      if (!existingPost) return res.status(404).json({ success: false, error: "Post not found" });
      if (
        existingPost.localOnly === true &&
        String(existingPost?.status || "").trim().toLowerCase() === "failed"
      ) {
        return res.status(409).json({
          success: false,
          error: "Failed placeholder posts cannot be edited. Retry or delete the failed post instead.",
        });
      }

      const { payload, replacementFile } = await parsePostPatchPayload(req);
      if (replacementFile?.filepath && replacementFile?.originalFilename) {
        const replacementResult = await replacePostWithNewVideo({
          postId,
          existingPost,
          content: payload.content ?? existingPost.content ?? "",
          publishAt: payload.publish_at ?? existingPost.publish_at,
          replacementFile,
        });
        return res.status(200).json({ success: true, replacedPostId: replacementResult.replacedPostId, data: replacementResult.data });
      }

      const post = await updatePost(postId, payload);
      if (!post) return res.status(404).json({ success: false, error: "Post not found" });
      return res.status(200).json({ success: true, data: mergePostDetails(post) });
    } catch (error) {
      return res.status(500).json({ success: false, error: errorMessage(error, "Failed to update post") });
    }
  }

  return res.status(405).json({ success: false, error: "Method not allowed" });
}
