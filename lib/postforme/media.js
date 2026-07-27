import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

import axios from "axios";

import postformeClient from "@/lib/api/postformeClient";
import {
  createBulkPublishAbortError,
  throwIfBulkPublishAborted,
} from "@/lib/pipeline/bulkPublishRunRegistry";

const CONTENT_TYPES = new Map([
  [".avi", "video/x-msvideo"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".m4v", "video/x-m4v"],
  [".mkv", "video/x-matroska"],
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".webm", "video/webm"],
]);

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function inferMediaType(value) {
  const extension = path.extname(String(value || "").split("?")[0]).toLowerCase();
  const contentType = CONTENT_TYPES.get(extension) || "";
  return contentType.startsWith("image/") ? "image" : "video";
}

function getContentType(filePath) {
  return CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || "video/mp4";
}

function normalizeMediaType(value, mediaPath) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["image", "video"].includes(normalized)
    ? normalized
    : inferMediaType(mediaPath);
}

function cleanMediaItem(item, url, mediaPath) {
  return {
    url,
    type: normalizeMediaType(item?.type, mediaPath || url),
    ...(item?.thumbnail_url ? { thumbnail_url: item.thumbnail_url } : {}),
    ...(item?.thumbnail_timestamp_ms
      ? { thumbnail_timestamp_ms: item.thumbnail_timestamp_ms }
      : {}),
    ...(Array.isArray(item?.tags) ? { tags: item.tags } : {}),
    ...(item?.skip_processing !== undefined
      ? { skip_processing: Boolean(item.skip_processing) }
      : {}),
  };
}

async function uploadToSignedUrl({ uploadUrl, filePath, fileSize, signal }) {
  throwIfBulkPublishAborted(signal);

  const stream = fs.createReadStream(filePath);

  try {
    const response = await axios.put(uploadUrl, stream, {
      headers: {
        "Content-Length": fileSize,
        "Content-Type": getContentType(filePath),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      proxy: false,
      signal,
      timeout: 180000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`PostForMe media upload failed: ${response.status}`);
    }
  } finally {
    stream.destroy();
  }
}

export async function uploadMediaFile(filePath, options = {}) {
  const signal = options.signal;
  const resolvedPath = String(filePath || "").trim();

  if (!resolvedPath) {
    throw new Error("Media file path is required");
  }

  throwIfBulkPublishAborted(signal);

  let stat;

  try {
    stat = await fsPromises.stat(resolvedPath);
  } catch (error) {
    throw new Error(`Media file not found or unreadable: ${error.message}`);
  }

  if (!stat.isFile()) {
    throw new Error("Media path must be a file");
  }

  if (stat.size <= 0) {
    throw new Error("Media file is empty");
  }

  const upload = await postformeClient.post("/media/create-upload-url", undefined, {
    signal,
  });

  const uploadUrl = String(upload?.upload_url || "").trim();
  const mediaUrl = String(upload?.media_url || "").trim();

  if (!uploadUrl || !mediaUrl) {
    throw new Error("Invalid PostForMe media upload response");
  }

  await uploadToSignedUrl({
    uploadUrl,
    filePath: resolvedPath,
    fileSize: stat.size,
    signal,
  });

  return {
    media_url: mediaUrl,
    upload_url: uploadUrl,
  };
}

export async function resolvePostMedia(media = [], options = {}) {
  const signal = options.signal;
  const fallbackSourcePath = String(options.sourceFilePath || "").trim();
  const sourceMedia = Array.isArray(media) && media.length
    ? media
    : fallbackSourcePath
      ? [{ url: fallbackSourcePath }]
      : [];

  if (!sourceMedia.length) {
    return [];
  }

  const resolvedMedia = [];

  for (const item of sourceMedia) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : createBulkPublishAbortError();
    }

    const rawUrl = String(item?.url || "").trim();
    const mediaPath = rawUrl || fallbackSourcePath;

    if (!mediaPath) {
      continue;
    }

    if (isHttpUrl(mediaPath)) {
      resolvedMedia.push(cleanMediaItem(item, mediaPath, mediaPath));
      continue;
    }

    const upload = await uploadMediaFile(mediaPath, { signal });
    resolvedMedia.push(cleanMediaItem(item, upload.media_url, mediaPath));
  }

  return resolvedMedia;
}
