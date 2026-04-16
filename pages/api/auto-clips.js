import formidable from "formidable";

import {
  analyzeYoutubeMoments,
  createPostsFromGeneratedClips,
  downloadYoutubeMomentClips,
  isYoutubeUrl,
} from "@/lib/autoClips";

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
  return Array.isArray(value) ? value[0] : value;
}

function getSingleFile(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fields, files } = await parseForm(req);
    const campaignSlug = String(getSingleValue(fields.campaignSlug) || "").trim();
    const youtubeUrl = String(getSingleValue(fields.youtubeUrl) || "").trim();
    const uploadedFile = getSingleFile(files.videoFile);

    if (!campaignSlug) {
      return res
        .status(400)
        .json({ success: false, error: "campaignSlug is required" });
    }

    if (!youtubeUrl && !uploadedFile) {
      return res.status(400).json({
        success: false,
        error: "Provide a YouTube URL or upload a file",
      });
    }

    if (youtubeUrl) {
      if (!isYoutubeUrl(youtubeUrl)) {
        return res.status(400).json({
          success: false,
          error: "Only YouTube URLs are supported right now",
        });
      }

      const analysis = await analyzeYoutubeMoments(youtubeUrl);

      if (!analysis?.success || !Array.isArray(analysis?.moments)) {
        return res.status(502).json({
          success: false,
          error: "Analyzer did not return moments",
        });
      }

      const downloadResult = await downloadYoutubeMomentClips({
        campaignSlug,
        url: youtubeUrl,
        moments: analysis.moments,
      });
      const postResult = await createPostsFromGeneratedClips({
        campaignSlug,
        clips: downloadResult.clips,
      });

      return res.status(200).json({
        success: true,
        source: "youtube",
        moments: downloadResult.clips,
        outputDir: downloadResult.outputDir,
        posts: postResult.createdPosts,
        publishDates: postResult.publishDates,
        targetCount: postResult.targetCount,
      });
    }

    return res.status(400).json({
      success: false,
      error: "File upload UI is present, but auto-analysis currently supports YouTube URLs only",
    });
  } catch (error) {
    console.error("auto clips failed:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to generate auto clips",
    });
  }
}
