import { createUploadSlot } from "@/lib/media/createUploadSlot";
import { uploadToSignedUrl } from "@/lib/media/uploadToSignedUrl";

export async function uploadMediaPipeline(file) {
  try {
    // 🔹 Step 1: resolve filename
    const filename =
      file.originalFilename ||
      file.name ||
      `video_${Date.now()}.mp4`;

    // 🔹 Step 2: create upload slot
    const slot = await createUploadSlot(filename, "video");

    if (!slot?.upload?.signedUrl) {
      throw new Error("Failed to get signed upload URL");
    }

    // 🔹 Step 3: resolve buffer
    let buffer;

    if (file.buffer) {
      buffer = file.buffer;
    } else if (file.arrayBuffer) {
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      throw new Error("Unsupported file format");
    }

    // 🔹 Step 4: upload to signed URL
    await uploadToSignedUrl(slot.upload.signedUrl, buffer);

    // 🔹 Step 5: validate media_id
    if (!slot.media_id) {
      throw new Error("Missing media_id after upload");
    }

    return slot.media_id;
  } catch (error) {
    console.error(
      "❌ uploadMediaPipeline error:",
      error.response?.data || error.message
    );

    throw error;
  }
}