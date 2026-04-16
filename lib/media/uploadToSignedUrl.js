import axios from "axios";
import fs from 'fs'

export async function uploadToSignedUrl(signedUrl, filePath) {
  const buffer = fs.createReadStream(filePath);

  await axios.put(signedUrl, buffer, {
    headers: {
      "Content-Type": "video/mp4",
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });
}