import fs from "fs";
import postonceClient from "@/lib/api/postonceClient";
import axios from "axios";

/**
 * Wait until media is ready (public_url exists)
 */
async function waitForPublicUrl(mediaId) {
  for (let i = 0; i < 15; i++) {
    const data = await postonceClient.get(`/media/${mediaId}`);

    const url = data?.public_url;

    if (url) {
      return url;
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error("Media not ready (public_url missing)");
}

/**
 * Upload using STREAM + fetch (SAFE)
 */
async function uploadToSignedUrl(signedUrl, filePath) {
  const buffer = fs.readFileSync(filePath);

  const res = await axios.put(signedUrl, buffer, {
    headers: {
      "Content-Type": "video/mp4",
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  if (res.status !== 200) {
    throw new Error(`Upload failed: ${res.status}`);
  }

  console.log("Upload response:", res.status);
}

/**
 * MAIN PIPELINE
 */
export async function uploadMediaPipeline(file) {
  try {
    // 1. Get signed upload URL
    const data = await postonceClient.post("/media/uploads", {
      filename: file.name,
      content_type: "video",
    });

    if (!data?.upload?.signedUrl) {
      throw new Error("Invalid upload response");
    }

    const signedUrl = data.upload.signedUrl;
    const mediaId = data.media_id;

    // 2. Upload video (STREAM)
    await uploadToSignedUrl(signedUrl, file.path);

    console.log("✅ Uploaded:", file.name);

    // 3. Wait until media is ready
    const publicUrl = await waitForPublicUrl(mediaId);

    console.log("🌐 Ready URL:", publicUrl);

    return {
      media_id: mediaId,
      url: publicUrl,
    };
  } catch (err) {
    console.error(
      "❌ uploadMediaPipeline error:",
      err.response?.data || err.message
    );
    throw err;
  }
}