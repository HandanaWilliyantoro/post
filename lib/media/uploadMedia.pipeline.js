import fs from "fs";
import postonceClient from "@/lib/api/postonceClient";
import axios from "axios";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";

async function waitForPublicUrl(mediaId) {
  for (let i = 0; i < 15; i++) {
    const data = await postonceClient.get(`/media/${mediaId}`);
    const url = data?.public_url;

    if (url) {
      return url;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Media not ready (public_url missing)");
}

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

export async function uploadMediaPipeline(file) {
  try {
    const data = await postonceClient.post("/media/uploads", {
      filename: file.name,
      content_type: "video",
    });

    if (!data?.upload?.signedUrl) {
      throw new Error("Invalid upload response");
    }

    const signedUrl = data.upload.signedUrl;
    const mediaId = data.media_id;

    await uploadToSignedUrl(signedUrl, file.path);
    console.log("[uploadMediaPipeline] uploaded:", file.name);

    const publicUrl = await waitForPublicUrl(mediaId);
    console.log("[uploadMediaPipeline] ready:", publicUrl);

    return {
      media_id: mediaId,
      url: publicUrl,
    };
  } catch (error) {
    console.error(formatErrorForLog(error, "[uploadMediaPipeline error]"));
    throw error;
  }
}
