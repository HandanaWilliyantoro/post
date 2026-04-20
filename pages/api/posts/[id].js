import postonceClient from "@/lib/api/postonceClient";
import { getPostById, updatePost } from "@/lib/post";
import { mergePostDetails, removeLocalPost, replacePostWithNewVideo } from "@/lib/post/api/postDetails";
import { parsePostPatchPayload } from "@/lib/post/api/requestParsers";

export const config = {
  api: { bodyParser: false },
};

function errorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;
}

export default async function handler(req, res) {
  const postId = String(req.query?.id || "").trim();
  if (!postId) return res.status(400).json({ success: false, error: "id is required" });

  if (req.method === "GET") {
    try {
      const localPost = await getPostById(postId);
      if (!localPost) return res.status(404).json({ success: false, error: "Post not found" });
      try {
        return res.status(200).json({ success: true, data: mergePostDetails(localPost, await postonceClient.get(`/posts/${postId}`)) });
      } catch {
        return res.status(200).json({ success: true, data: localPost });
      }
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method === "DELETE") {
    try {
      await postonceClient.delete(`/posts/${postId}`);
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
      return res.status(200).json({ success: true, data: mergePostDetails(post, await postonceClient.get(`/posts/${postId}`)) });
    } catch (error) {
      return res.status(500).json({ success: false, error: errorMessage(error, "Failed to update post") });
    }
  }

  return res.status(405).json({ success: false, error: "Method not allowed" });
}
