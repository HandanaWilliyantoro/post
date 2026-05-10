import fs from "fs";
import postonceClient from "@/lib/api/postonceClient";
import axios from "axios";
import {
  createBulkPublishAbortError,
  throwIfBulkPublishAborted,
} from "@/lib/pipeline/bulkPublishRunRegistry";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";

function waitWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : createBulkPublishAbortError());
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      reject(signal.reason instanceof Error ? signal.reason : createBulkPublishAbortError());
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForPublicUrl(mediaId, signal) {
  for (let i = 0; i < 15; i++) {
    throwIfBulkPublishAborted(signal);
    const data = await postonceClient.get(`/media/${mediaId}`, { signal });
    const url = data?.public_url;

    if (url) {
      return url;
    }

    await waitWithSignal(1000, signal);
  }

  throw new Error("Media not ready (public_url missing)");
}

async function uploadToSignedUrl(signedUrl, filePath, signal) {
  throwIfBulkPublishAborted(signal);
  const buffer = fs.readFileSync(filePath);

  const res = await axios.put(signedUrl, buffer, {
    headers: {
      "Content-Type": "video/mp4",
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 180000,
    signal,
  });

  if (res.status !== 200) {
    throw new Error(`Upload failed: ${res.status}`);
  }

  console.log("Upload response:", res.status);
}

export async function uploadMediaPipeline(file, options = {}) {
  const signal = options?.signal;

  try {
    throwIfBulkPublishAborted(signal);
    const data = await postonceClient.post("/media/uploads", {
      filename: file.name,
      content_type: "video",
    }, {
      signal,
    });

    if (!data?.upload?.signedUrl) {
      throw new Error("Invalid upload response");
    }

    const signedUrl = data.upload.signedUrl;
    const mediaId = data.media_id;

    await uploadToSignedUrl(signedUrl, file.path, signal);
    console.log("[uploadMediaPipeline] uploaded:", file.name);

    const publicUrl = await waitForPublicUrl(mediaId, signal);
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
