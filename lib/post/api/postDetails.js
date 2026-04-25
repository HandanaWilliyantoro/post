import { uploadMediaPipeline } from "@/lib/media/uploadMedia.pipeline";
import { createPost } from "@/lib/post";
import { clearPostsCache, ensurePostsCollection } from "@/lib/post/queries/listPosts";
import postonceClient from "@/lib/api/postonceClient";

export async function removeLocalPost(postId) {
  const collection = await ensurePostsCollection();
  await collection.deleteOne({ id: postId });
  clearPostsCache();
}

export function mergePostDetails(localPost, remotePost) {
  return {
    ...(localPost || {}),
    ...(remotePost || {}),
    id: remotePost?.id || localPost?.id,
    content: remotePost?.content ?? localPost?.content ?? "",
    external_id: remotePost?.external_id ?? localPost?.external_id ?? null,
    media: Array.isArray(remotePost?.media) ? remotePost.media : Array.isArray(localPost?.media) ? localPost.media : [],
    origin: remotePost?.origin ?? localPost?.origin ?? null,
    publish_at: remotePost?.publish_at ?? localPost?.publish_at ?? null,
    campaignType: localPost?.campaignType ?? null,
    campaignId: localPost?.campaignId ?? "",
    campaignPassword: localPost?.campaignPassword ?? "",
    created_at: remotePost?.created_at ?? localPost?.created_at ?? null,
    targets: Array.isArray(remotePost?.targets) ? remotePost.targets : Array.isArray(localPost?.targets) ? localPost.targets : [],
  };
}

export async function replacePostWithNewVideo({ postId, existingPost, content, publishAt, replacementFile }) {
  const uploadedMedia = await uploadMediaPipeline({ name: replacementFile.originalFilename, path: replacementFile.filepath });
  const nextPost = await createPost({
    campaignSlug: existingPost?.campaignSlug,
    content,
    publish_at: publishAt,
    targets: Array.isArray(existingPost?.targets) ? existingPost.targets : [],
    media: [{ url: uploadedMedia.url, type: "video" }],
    source_file_path: existingPost?.source_file_path || null,
  });

  try {
    await postonceClient.delete(`/posts/${postId}`);
    await removeLocalPost(postId);
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.response?.data?.message || error?.message || "Replacement post was created, but the previous post could not be deleted");
  }

  return {
    replacedPostId: postId,
    data: mergePostDetails(nextPost, await postonceClient.get(`/posts/${nextPost.id}`)),
  };
}
