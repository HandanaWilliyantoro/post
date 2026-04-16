import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { execFile } from "child_process";

import axios from "axios";
import { getAccounts } from "@/lib/accounts/getAccounts";
import { publishVideo } from "@/lib/pipeline/publishVideo";
import { listAllPosts } from "@/lib/post";
import { buildNextPublishDates } from "@/lib/post/schedule";

const execFileAsync = promisify(execFile);
const ANALYZE_URL = "http://localhost:5555/short_maker/analyze_moments";
const ANALYZE_REFERER = "http://localhost:5555/short_maker/";
const YT_DLP_PATH = "C:\\yt-dlp\\yt-dlp.exe";
const AUTO_CLIPS_ROOT = path.join(os.homedir(), "Videos", "auto-clips");

function sanitizeSegment(value, fallback) {
  const sanitized = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return sanitized || fallback;
}

function buildOutputDir(campaignSlug) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(AUTO_CLIPS_ROOT, sanitizeSegment(campaignSlug, "campaign"), stamp);
}

function buildClipTemplate(outputDir, index, title) {
  const safeTitle = sanitizeSegment(title, `clip-${index + 1}`);
  return path.join(outputDir, `${String(index + 1).padStart(2, "0")}-${safeTitle}.%(ext)s`);
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

export function isYoutubeUrl(value) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(
    String(value || "").trim()
  );
}

export async function analyzeYoutubeMoments(url) {
  const response = await axios.post(
    ANALYZE_URL,
    {
      url,
      duration_target: "auto",
      customApiKey: "",
      niche: "",
    },
    {
      headers: {
        Referer: ANALYZE_REFERER,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
      },
      timeout: 5 * 60 * 1000,
    }
  );

  return response.data;
}

export async function downloadYoutubeMomentClips({ campaignSlug, url, moments }) {
  const outputDir = buildOutputDir(campaignSlug);
  await ensureDir(outputDir);

  const clips = [];

  for (const [index, moment] of moments.entries()) {
    const outputTemplate = buildClipTemplate(outputDir, index, moment.title);
    const downloadSections = `*${moment.start_time}-${moment.end_time}`;

    await execFileAsync(
      YT_DLP_PATH,
      [
        "--force-overwrites",
        "--no-playlist",
        "--download-sections",
        downloadSections,
        "--force-keyframes-at-cuts",
        "--merge-output-format",
        "mp4",
        "-o",
        outputTemplate,
        url,
      ],
      {
        env: {
          ...process.env,
          TEMP: process.env.TEMP || "C:\\Users\\USER\\AppData\\Local\\Temp",
          TMP: process.env.TMP || "C:\\Users\\USER\\AppData\\Local\\Temp",
        },
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    const expectedPath = outputTemplate.replace("%(ext)s", "mp4");

    clips.push({
      ...moment,
      output_path: expectedPath,
    });
  }

  return {
    outputDir,
    clips,
  };
}

function buildPostContent(moment) {
  return [moment.title, moment.description, moment.hashtags]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export async function createPostsFromGeneratedClips({
  campaignSlug,
  clips,
}) {
  const accounts = await getAccounts({ campaignSlug });

  if (!accounts.length) {
    throw new Error("No assigned accounts are available for this campaign");
  }

  const existingPosts = await listAllPosts({ campaignSlug });
  const publishDates = buildNextPublishDates({
    campaignSlug,
    existingPosts,
    count: clips.length,
  });

  const createdPosts = [];

  for (const [index, clip] of clips.entries()) {
    const post = await publishVideo({
      file: {
        name: path.basename(clip.output_path),
        path: clip.output_path,
      },
      accountIds: accounts.map((account) => account.id),
      content: buildPostContent(clip),
      publishAt: publishDates[index],
      campaignSlug,
      sourceFilePath: clip.output_path,
      clipMoment: {
        title: clip.title,
        start_time: clip.start_time,
        end_time: clip.end_time,
        viral_score: clip.viral_score,
      },
    });

    createdPosts.push(post);
  }

  return {
    createdPosts,
    publishDates,
    targetCount: accounts.length,
  };
}
