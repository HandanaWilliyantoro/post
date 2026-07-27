import { updatePost } from "@/lib/post/mutations/updatePost";
import { clearPostsCache, ensurePostsCollection } from "@/lib/post/queries/listPosts";

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
    status: remotePost?.status ?? localPost?.status ?? null,
    campaignType: localPost?.campaignType ?? null,
    created_at: remotePost?.created_at ?? localPost?.created_at ?? null,
    targets: Array.isArray(remotePost?.targets) ? remotePost.targets : Array.isArray(localPost?.targets) ? localPost.targets : [],
  };
}

export async function replacePostWithNewVideo({ postId, existingPost, content, publishAt, replacementFile }) {
  const post = await updatePost(postId, {
    content,
    publish_at: publishAt,
    media: [{ url: replacementFile.filepath, type: "video" }],
    source_file_path: replacementFile.filepath,
  });

  return {
    replacedPostId: postId,
    data: mergePostDetails(post || existingPost),
  };
}
