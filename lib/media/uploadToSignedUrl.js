import axios from "axios";

export async function uploadToSignedUrl(signedUrl, buffer) {
  await axios.put(signedUrl, buffer, {
    headers: {
      "Content-Type": "video/mp4",
    },
  });
}