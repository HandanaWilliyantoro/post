import postonceClient from "@/lib/api/postonceClient";

export async function createPost({
  content,
  targets,
  media = [],
  publishAt = null,
  externalId = null,
}) {
  try {
    // 🔹 Validation
    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      throw new Error("targets must be a non-empty array");
    }

    if (!content && (!media || media.length === 0)) {
      throw new Error("Either content or media must be provided");
    }

    /**
     * 🔹 Resolve media_id → public_url
     */
    async function resolveMediaUrl(mediaId) {
      const media = await postonceClient.get(`/media/${mediaId}`);

      const url = media?.public_url;

      if (!url) {
        throw new Error(`No public_url found for media_id: ${mediaId}`);
      }

      return url;
    }

    /**
     * 🔹 Transform media array
     * [{ media_id }] → [{ url, type: "video" }]
     */
    async function transformMedia(mediaArray = []) {
      const results = await Promise.all(
        mediaArray.map(async (item) => {
          if (!item.media_id) return null;

          const url = await resolveMediaUrl(item.media_id);

          return {
            url,
            type: "video", // always video
          };
        })
      );

      return results.filter(Boolean);
    }

    // 🔹 Transform media if exists
    let transformedMedia = [];
    if (media.length > 0) {
      transformedMedia = await transformMedia(media);
    }

    // 🔹 Build payload
    const payload = {
      content,
      targets,
    };

    if (transformedMedia.length > 0) {
      payload.media = transformedMedia;
    }

    if (publishAt) {
      payload.publish_at = publishAt;
    }

    if (externalId) {
      payload.external_id = externalId;
    }

    // 🔹 API call
    const response = await postonceClient.post("/posts", payload);

    const postedVideo = response;

    // 🔹 Safety check
    if (!postedVideo) {
      throw new Error("Invalid response from PostOnce");
    }

    return postedVideo;
  } catch (error) {
    console.error(
      "❌ createPost error:",
      error.response?.data || error.message
    );

    throw error;
  }
}