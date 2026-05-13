import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { uploadMediaPipeline } from "@/lib/media/uploadMedia.pipeline";
import {
  createPost,
  persistFailedPostRecord,
  persistQueuedPostRecord,
} from "@/lib/post";
import { ensurePostsCollection } from "@/lib/post/queries/listPosts";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";

const MANUAL_POST_UPLOAD_DIR = path.join(os.tmpdir(), "post-manual-posts");
const WORKER_KEY = "__manual_post_worker_running__";

function extractDocument(result) {
  if (!result) {
    return null;
  }

  if (result.value) {
    return result.value;
  }

  return result;
}

function normalizeFileName(value, fallback = "upload.mp4") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeFileExtension(fileName) {
  const extension = path.extname(fileName);
  return extension || ".mp4";
}

async function cleanupFile(filePath) {
  if (!String(filePath || "").trim()) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error(
        formatErrorForLog(error, "[manualPostQueue] failed to clean up file")
      );
    }
  }
}

async function updateManualJobState(selector, data = {}) {
  const collection = await ensurePostsCollection();
  await collection.updateOne(selector, { $set: data });
}

async function claimNextQueuedManualPost() {
  const collection = await ensurePostsCollection();
  const now = new Date().toISOString();
  const result = await collection.findOneAndUpdate(
    {
      localOnly: true,
      origin: "manual",
      "manualJob.type": "manual-post",
      "manualJob.status": { $in: ["queued", "running"] },
    },
    {
      $set: {
        status: "processing",
        updated_at: now,
        "manualJob.status": "running",
        "manualJob.startedAt": now,
        "manualJob.lastError": "",
      },
    },
    {
      sort: { created_at: 1 },
      returnDocument: "after",
      projection: { _id: 0 },
    }
  );

  return extractDocument(result);
}

async function hasPendingManualPosts() {
  const collection = await ensurePostsCollection();
  return collection.countDocuments({
    localOnly: true,
    origin: "manual",
    "manualJob.type": "manual-post",
    "manualJob.status": { $in: ["queued", "running"] },
  });
}

async function processManualPost(post) {
  const sourceFilePath = String(post?.manualJob?.filePath || "").trim();
  const sourceFileName = normalizeFileName(post?.manualJob?.fileName);
  const duplicateKey = String(post?.duplicateKey || "").trim() || null;
  const targetSnapshot = Array.isArray(post?.targets) ? post.targets : [];

  if (!sourceFilePath) {
    throw new Error("Queued manual post is missing its uploaded video");
  }

  try {
    const uploadedMedia = await uploadMediaPipeline({
      name: sourceFileName,
      path: sourceFilePath,
    });
    const createdPost = await createPost({
      campaignSlug: post?.campaignSlug,
      content: post?.content || "",
      publish_at: post?.publish_at,
      duplicateKey,
      source_file_path: null,
      origin: post?.origin || "manual",
      targets: targetSnapshot,
      media: [{ url: uploadedMedia.url, type: "video" }],
    });

    await updateManualJobState(
      duplicateKey ? { duplicateKey } : { id: createdPost.id },
      {
        updated_at: new Date().toISOString(),
        "manualJob.status": "completed",
        "manualJob.completedAt": new Date().toISOString(),
        "manualJob.lastError": "",
      }
    );
  } catch (error) {
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      "Failed to create post";
    const failedPost = await persistFailedPostRecord({
      id: post?.id,
      campaignSlug: post?.campaignSlug,
      duplicateKey,
      content: post?.content || "",
      publish_at: post?.publish_at,
      origin: post?.origin || "manual",
      targets: targetSnapshot,
      media: Array.isArray(post?.media) ? post.media : [],
      source_file_path: null,
      failure: {
        message,
        videoName: sourceFileName,
        videoPath: sourceFilePath,
      },
    });

    await updateManualJobState(
      duplicateKey ? { duplicateKey } : { id: failedPost.id },
      {
        updated_at: new Date().toISOString(),
        "manualJob.status": "failed",
        "manualJob.completedAt": new Date().toISOString(),
        "manualJob.lastError": message,
      }
    );
  } finally {
    await cleanupFile(sourceFilePath);
  }
}

async function runManualPostWorkerLoop() {
  try {
    while (true) {
      const nextPost = await claimNextQueuedManualPost();

      if (!nextPost) {
        return;
      }

      await processManualPost(nextPost);
    }
  } finally {
    global[WORKER_KEY] = false;

    if (await hasPendingManualPosts()) {
      startManualPostWorker();
    }
  }
}

export async function stageManualPostUpload(uploadedFile) {
  const originalFileName = normalizeFileName(
    uploadedFile?.originalFilename,
    uploadedFile?.newFilename
  );
  const sourcePath = String(uploadedFile?.filepath || "").trim();

  if (!sourcePath) {
    throw new Error("A video file is required");
  }

  await fs.mkdir(MANUAL_POST_UPLOAD_DIR, { recursive: true });

  const stagedPath = path.join(
    MANUAL_POST_UPLOAD_DIR,
    `${randomUUID()}${normalizeFileExtension(originalFileName)}`
  );

  try {
    await fs.rename(sourcePath, stagedPath);
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }

    await fs.copyFile(sourcePath, stagedPath);
    await fs.unlink(sourcePath);
  }

  return {
    fileName: originalFileName,
    filePath: stagedPath,
  };
}

export async function queueManualPost(options = {}) {
  const queuedPost = await persistQueuedPostRecord({
    id: options.id,
    campaignSlug: options.campaignSlug,
    campaignType: options.campaignType,
    campaignId: options.campaignId,
    campaignPassword: options.campaignPassword,
    content: options.content,
    publish_at: options.publish_at,
    duplicateKey: options.duplicateKey,
    origin: "manual",
    targets: options.targets,
    media: [{ type: "video" }],
    source_file_path: null,
    manualJob: {
      type: "manual-post",
      status: "queued",
      queuedAt: new Date().toISOString(),
      fileName: options.fileName,
      filePath: options.filePath,
      lastError: "",
      targetCount: Array.isArray(options.targets) ? options.targets.length : 0,
    },
  });

  startManualPostWorker();
  return queuedPost;
}

export function isQueuedManualPost(post) {
  return (
    Boolean(post) &&
    post.localOnly === true &&
    post.origin === "manual" &&
    post?.manualJob?.type === "manual-post" &&
    ["queued", "running"].includes(String(post?.manualJob?.status || "").trim())
  );
}

export function startManualPostWorker() {
  if (typeof window !== "undefined") {
    return;
  }

  if (global[WORKER_KEY]) {
    return;
  }

  global[WORKER_KEY] = true;
  setImmediate(() => {
    void runManualPostWorkerLoop();
  });
}
