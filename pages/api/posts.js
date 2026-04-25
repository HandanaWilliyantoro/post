import formidable from "formidable";

import { findCampaignBySlug } from "@/lib/campaigns";
import { buildCampaignFields } from "@/lib/campaignMetadata";
import { getAccounts } from "@/lib/accounts/getAccounts";
import { uploadMediaPipeline } from "@/lib/media/uploadMedia.pipeline";
import {
  buildPostDuplicateKey,
  findDuplicatePost,
} from "@/lib/post/duplicateGuard";
import { createPost } from "@/lib/post";
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fields, files } = await parseForm(req);
    const campaignSlug = String(getSingleValue(fields.campaignSlug) || "").trim();
    const content = String(getSingleValue(fields.content) || "").trim();
    const publishAt = String(getSingleValue(fields.publish_at) || "").trim();
    const uploadedFile = getSingleFile(files.video);

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

    if (!uploadedFile?.filepath || !uploadedFile?.originalFilename) {
      return res
        .status(400)
        .json({ success: false, error: "A video file is required" });
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
    const duplicateKey = buildPostDuplicateKey({
      campaignSlug,
      content,
      publish_at: publishAtIso,
    });
    const duplicatePost = await findDuplicatePost(duplicateKey);

    if (duplicatePost) {
      return res.status(409).json({
        success: false,
        error: "This post is already scheduled for that campaign and publish time",
      });
    }

    const uploadedMedia = await uploadMediaPipeline({
      name: uploadedFile.originalFilename,
      path: uploadedFile.filepath,
    });

    const post = await createPost({
      campaignSlug,
      campaignType: campaign.campaignType,
      content,
      publish_at: publishAtIso,
      duplicateKey,
      targets: accounts.map((account) => ({
        account_id: account.id,
      })),
      media: [
        {
          url: uploadedMedia.url,
          type: "video",
        },
      ],
    });

    return res.status(201).json({
      success: true,
      data: post,
      meta: {
        targetCount: accounts.length,
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
