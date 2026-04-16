import formidable from "formidable";

import postonceClient from "@/lib/api/postonceClient";
import { uploadMediaPipeline } from "@/lib/media/uploadMedia.pipeline";
import { createPost, getPostById, updatePost } from "@/lib/post";
import {
  clearPostsCache,
  ensurePostsCollection,
} from "@/lib/post/queries/listPosts";
import { easternDateTimeInputToIso } from "@/lib/utils/easternTime";

export const config = {
  api: {
    bodyParser: false,
  },
};

function getSingleValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getSingleFile(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseMultipartForm(req) {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function removeLocalPost(postId) {
  const collection = await ensurePostsCollection();
  await collection.deleteOne({ id: postId });
  clearPostsCache();
}

async function replacePostWithNewVideo({
  postId,
  existingPost,
  content,
  publishAt,
  replacementFile,
}) {
  const uploadedMedia = await uploadMediaPipeline({
    name: replacementFile.originalFilename,
    path: replacementFile.filepath,
  });

  const nextPost = await createPost({
    campaignSlug: existingPost?.campaignSlug,
    content,
    publish_at: publishAt,
    targets: Array.isArray(existingPost?.targets) ? existingPost.targets : [],
    media: [
      {
        url: uploadedMedia.url,
        type: "video",
      },
    ],
    clip_moment: existingPost?.clip_moment || null,
    source_file_path: existingPost?.source_file_path || null,
  });

  try {
    await postonceClient.delete(`/posts/${postId}`);
    await removeLocalPost(postId);
  } catch (error) {
    throw new Error(
      error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Replacement post was created, but the previous post could not be deleted"
    );
  }

  const remotePost = await postonceClient.get(`/posts/${nextPost.id}`);

  return {
    replacedPostId: postId,
    data: mergePostDetails(nextPost, remotePost),
  };
}

function mergePostDetails(localPost, remotePost) {
  return {
    ...(localPost || {}),
    ...(remotePost || {}),
    id: remotePost?.id || localPost?.id,
    content: remotePost?.content ?? localPost?.content ?? "",
    external_id: remotePost?.external_id ?? localPost?.external_id ?? null,
    media: Array.isArray(remotePost?.media)
      ? remotePost.media
      : Array.isArray(localPost?.media)
      ? localPost.media
      : [],
    origin: remotePost?.origin ?? localPost?.origin ?? null,
    publish_at: remotePost?.publish_at ?? localPost?.publish_at ?? null,
    status: remotePost?.status ?? localPost?.status ?? null,
    created_at: remotePost?.created_at ?? localPost?.created_at ?? null,
    targets: Array.isArray(remotePost?.targets)
      ? remotePost.targets
      : Array.isArray(localPost?.targets)
      ? localPost.targets
      : [],
  };
}

export default async function handler(req, res) {
  const postId = String(req.query?.id || "").trim();

  if (!postId) {
    return res.status(400).json({ success: false, error: "id is required" });
  }

  if (req.method === "GET") {
    try {
      const localPost = await getPostById(postId);

      if (!localPost) {
        return res.status(404).json({ success: false, error: "Post not found" });
      }

      try {
        const remotePost = await postonceClient.get(`/posts/${postId}`);
        const mergedPost = mergePostDetails(localPost, remotePost);

        return res.status(200).json({ success: true, data: mergedPost });
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
      return res.status(500).json({
        success: false,
        error:
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          "Failed to delete post",
      });
    }
  }

  if (req.method === "PATCH") {
    try {
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      const isMultipart = contentType.includes("multipart/form-data");
      const payload = {};
      let replacementFile = null;
      const existingPost = await getPostById(postId);

      if (!existingPost) {
        return res.status(404).json({ success: false, error: "Post not found" });
      }

      if (isMultipart) {
        const { fields, files } = await parseMultipartForm(req);
        const content = String(getSingleValue(fields.content) || "").trim();
        const publishAt = String(getSingleValue(fields.publish_at) || "").trim();
        replacementFile = getSingleFile(files.video);

        if (content) {
          payload.content = content;
        }

        if (publishAt) {
          payload.publish_at = easternDateTimeInputToIso(publishAt);
        }
      } else {
        const body = await parseJsonBody(req);

        if (typeof body?.content === "string") {
          payload.content = body.content.trim();
        }

        if (typeof body?.publish_at === "string") {
          payload.publish_at = easternDateTimeInputToIso(body.publish_at.trim());
        }
      }

      if (replacementFile?.filepath && replacementFile?.originalFilename) {
        const replacementResult = await replacePostWithNewVideo({
          postId,
          existingPost,
          content: payload.content ?? existingPost.content ?? "",
          publishAt: payload.publish_at ?? existingPost.publish_at,
          replacementFile,
        });

        return res.status(200).json({
          success: true,
          replacedPostId: replacementResult.replacedPostId,
          data: replacementResult.data,
        });
      }

      const post = await updatePost(postId, payload);

      if (!post) {
        return res.status(404).json({ success: false, error: "Post not found" });
      }

      const remotePost = await postonceClient.get(`/posts/${postId}`);

      return res.status(200).json({
        success: true,
        data: mergePostDetails(post, remotePost),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error:
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          "Failed to update post",
      });
    }
  }

  return res.status(405).json({ success: false, error: "Method not allowed" });
}
