import formidable from "formidable";

import { findCampaignBySlug } from "@/lib/campaigns";
import { buildCampaignFields } from "@/lib/campaignMetadata";
import { getAccounts } from "@/lib/accounts/getAccounts";
import {
  buildPostDuplicateKey,
  findDuplicatePost,
  isBlockingDuplicatePost,
} from "@/lib/post/duplicateGuard";
import { startPostPublishCallbackWatcher } from "@/lib/post/publishCallbackWatcher";
import { queueManualPost, stageManualPostUpload } from "@/lib/post/manualPostQueue";
import { buildStoredPostTarget } from "@/lib/post/targets";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";
import { easternDateTimeInputToIso } from "@/lib/utils/easternTime";

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseForm(req) {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function getSingleValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getSingleFile(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isVideoFile(file) {
  const fileName = String(file?.originalFilename || "").trim();
  const mimeType = String(file?.mimetype || "").toLowerCase();

  return (
    mimeType.startsWith("video/") ||
    /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(fileName)
  );
}

function isImageFile(file) {
  const fileName = String(file?.originalFilename || "").trim();
  const mimeType = String(file?.mimetype || "").toLowerCase();

  return (
    mimeType.startsWith("image/") ||
    /\.(png|jpe?g)$/i.test(fileName)
  );
}

function getUploadedMedia(files) {
  const uploadedImage = getSingleFile(files.image);
  const uploadedVideo = getSingleFile(files.video);

  if (uploadedImage?.filepath) {
    return {
      file: uploadedImage,
      mediaType: "image",
      isValid: isImageFile(uploadedImage),
    };
  }

  if (uploadedVideo?.filepath) {
    return {
      file: uploadedVideo,
      mediaType: "video",
      isValid: isVideoFile(uploadedVideo),
    };
  }

  return {
    file: null,
    mediaType: "",
    isValid: false,
  };
}

function buildTargetSnapshot(account) {
  return buildStoredPostTarget(account);
}

export default async function handler(req, res) {
  startPostPublishCallbackWatcher();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fields, files } = await parseForm(req);
    const campaignSlug = String(getSingleValue(fields.campaignSlug) || "").trim();
    const content = String(getSingleValue(fields.content) || "").trim();
    const publishAt = String(getSingleValue(fields.publish_at) || "").trim();
    const uploadedMedia = getUploadedMedia(files);

    if (!campaignSlug) {
      return res
        .status(400)
        .json({ success: false, error: "campaignSlug is required" });
    }

    if (!content) {
      return res
        .status(400)
        .json({ success: false, error: "content is required" });
    }

    if (!publishAt || Number.isNaN(new Date(publishAt).getTime())) {
      return res
        .status(400)
        .json({ success: false, error: "Valid publish_at is required" });
    }

    if (!uploadedMedia.file?.filepath || !uploadedMedia.file?.originalFilename) {
      return res
        .status(400)
        .json({ success: false, error: "A video or image file is required" });
    }

    if (!uploadedMedia.isValid) {
      return res.status(400).json({
        success: false,
        error: `A valid ${uploadedMedia.mediaType} file is required`,
      });
    }

    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    buildCampaignFields(campaign);

    const accounts = await getAccounts({ campaignSlug });

    if (!accounts.length) {
      return res.status(400).json({
        success: false,
        error: "No assigned accounts are available for this campaign",
      });
    }

    const publishAtIso = easternDateTimeInputToIso(publishAt);
    const targetSnapshot = accounts.map(buildTargetSnapshot);
    const duplicateKey = buildPostDuplicateKey({
      campaignSlug,
      content,
      publish_at: publishAtIso,
      targets: targetSnapshot,
    });
    const duplicatePost = await findDuplicatePost(duplicateKey);

    if (isBlockingDuplicatePost(duplicatePost)) {
      return res.status(409).json({
        success: false,
        error:
          "This post is already scheduled for that campaign, target set, and publish time",
      });
    }

    const stagedUpload = await stageManualPostUpload(uploadedMedia.file);
    const queuedPost = await queueManualPost({
      campaignSlug,
      campaignType: campaign?.campaignType,
      content,
      publish_at: publishAtIso,
      duplicateKey,
      targets: targetSnapshot,
      mediaType: uploadedMedia.mediaType,
      fileName: stagedUpload.fileName,
      filePath: stagedUpload.filePath,
    });

    return res.status(202).json({
      success: true,
      data: queuedPost,
      meta: {
        targetCount: accounts.length,
        queued: true,
      },
    });
  } catch (error) {
    console.error(formatErrorForLog(error, "[api/posts] Failed to create post"));
    const message = error?.message || "Failed to create post";
    const statusCode =
      message.includes("required") ||
      message.includes("not found") ||
      message.includes("invalid")
        ? 400
        : 500;

    return res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
}
