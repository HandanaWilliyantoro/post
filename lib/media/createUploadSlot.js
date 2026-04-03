import postonceClient from "@/lib/api/postonceClient";

export async function createUploadSlot(filename, content_type) {
  const uploadedSlot = await postonceClient.post("/media/uploads", {
    filename,
    content_type,
  });

  return uploadedSlot;
}