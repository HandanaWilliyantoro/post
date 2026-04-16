import { createPost } from "@/lib/post";
import { uploadMediaPipeline } from "@/lib/media/uploadMedia.pipeline";

export async function publishVideo({
  file,
  accountIds,
  content,
  publishAt,
  campaignSlug,
  sourceFilePath,
  clipMoment,
}) {
  const uploaded = await uploadMediaPipeline(file);

  if (!uploaded?.media_id) {
    throw new Error("Upload failed: no media_id");
  }

  const post = await createPost({
    content,
    campaignSlug,
    source_file_path: sourceFilePath || file?.path || null,
    clip_moment: clipMoment || null,
    targets: accountIds.map((id) => ({
      account_id: id,
    })),
    media: [
      {
        url: uploaded.url,
        type: "video",
      },
    ],
    publish_at: publishAt,
  });

  console.log("[pipeline/publishVideo] scheduled:", publishAt);

  return post;
}
