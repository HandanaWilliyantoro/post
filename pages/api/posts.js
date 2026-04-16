import formidable from "formidable";

import { getAccounts } from "@/lib/accounts/getAccounts";
import { uploadMediaPipeline } from "@/lib/media/uploadMedia.pipeline";
import { createPost } from "@/lib/post";
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

    const accounts = await getAccounts({ campaignSlug });

    if (!accounts.length) {
      return res.status(400).json({
        success: false,
        error: "No assigned accounts are available for this campaign",
      });
    }

    const uploadedMedia = await uploadMediaPipeline({
      name: uploadedFile.originalFilename,
      path: uploadedFile.filepath,
    });

    const post = await createPost({
      campaignSlug,
      content,
      publish_at: easternDateTimeInputToIso(publishAt),
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
    console.error("Failed to create post:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to create post",
    });
  }
}
