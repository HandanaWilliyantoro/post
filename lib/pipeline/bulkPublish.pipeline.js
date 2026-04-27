import fs from "fs";
import path from "path";

import { getAccounts } from "@/lib/accounts/getAccounts";
import { findCampaignBySlug } from "@/lib/campaigns";
import { publishVideo } from "@/lib/pipeline/publishVideo";
import { getCampaignScheduleConfig } from "@/lib/post/schedule";
import { EASTERN_LABEL, easternDateTimeInputToIso } from "@/lib/utils/easternTime";
import { getRandomCaption } from "@/lib/utils/getRandomCaption";
import {
  loadProgress,
  resetProgress,
  saveProgress,
} from "@/lib/utils/progressManager";
import { VideoPool } from "@/lib/utils/videoPool";

function loadVideos(dir) {
  const files = fs.readdirSync(dir);

  return files
    .map((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (!stat.isFile()) return null;

      const ext = path.extname(file).toLowerCase();
      if (![".mp4", ".mov", ".avi", ".mkv"].includes(ext)) {
        return null;
      }

      return {
        name: file,
        path: fullPath,
      };
    })
    .filter(Boolean);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePublishDate(startDate, dayIndex, postInDayIndex, config) {
  const startParts = String(startDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!startParts) {
    throw new Error(`Invalid ${EASTERN_LABEL} startDate format`);
  }

  const baseDate = new Date(
    Number(startParts[1]),
    Number(startParts[2]) - 1,
    Number(startParts[3]) + dayIndex,
    0,
    0,
    0,
    0
  );

  const randomizedStartHour = Math.max(
    0,
    Number(config?.startHour || 6) + randomInt(0, 1)
  );
  let hourOffset = postInDayIndex * Math.max(1, Number(config?.hourGap || 1));

  if (Math.random() < 0.1) {
    hourOffset += randomInt(0, Math.max(1, Number(config?.hourGap || 1)));
  }

  const publishHour = randomizedStartHour + hourOffset;
  const publishMinute = randomInt(0, 10);
  const dayPrefix = `${baseDate.getFullYear()}-${String(
    baseDate.getMonth() + 1
  ).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;

  return easternDateTimeInputToIso(
    `${dayPrefix}T${String(publishHour).padStart(2, "0")}:${String(
      publishMinute
    ).padStart(2, "0")}`
  );
}

function getDaysUntilEndOfMonth(startDate) {
  const date = new Date(startDate);
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  const diffMs = endOfMonth.getTime() - startOfDay.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

export async function bulkPublishPipeline({
  videoDir,
  startDate,
  campaignSlug,
}) {
  let progress = null;

  try {
    if (!campaignSlug) {
      throw new Error("campaignSlug is required");
    }

    if (!videoDir) {
      throw new Error("videoDir is required");
    }

    if (!startDate) {
      throw new Error("startDate is required");
    }

    if (Number.isNaN(new Date(startDate).getTime())) {
      throw new Error("Invalid startDate format");
    }

    const campaign = await findCampaignBySlug(campaignSlug);

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const days = getDaysUntilEndOfMonth(startDate);
    const videos = loadVideos(videoDir);

    if (!videos.length) {
      throw new Error("No videos found");
    }

    const accounts = await getAccounts({ campaignSlug });
    const scheduleConfig = getCampaignScheduleConfig(campaignSlug);

    if (!accounts.length) {
      throw new Error("No accounts");
    }

    const postsPerDay = Number(scheduleConfig?.postsPerDay || 10);
    const postsPerSlot = campaign.campaignType === "auto-scan" ? accounts.length : 1;
    const totalCount = days * postsPerDay * Math.max(1, postsPerSlot);

    await resetProgress({
      campaignSlug,
      startDate,
      videoDir,
      totalCount,
      status: "running",
    });

    progress = await loadProgress();
    const pool = new VideoPool(videos, progress.videoIndex || 0);

    let day = progress.day || 0;
    let postInDay = progress.postInDay || 0;
    let completedCount = progress.completedCount || 0;

    for (; day < days; day++) {
      for (; postInDay < postsPerDay; postInDay++) {
        const video = pool.next();
        const publishAt = generatePublishDate(
          startDate,
          day,
          postInDay,
          scheduleConfig
        );
        const caption = getRandomCaption();

        try {
          const createdPosts = await publishVideo({
            file: video,
            accounts,
            content: caption,
            publishAt,
            campaignSlug,
            sourceFilePath: video.path,
            origin: "bulk_queue",
          });

          completedCount += Math.max(
            1,
            Array.isArray(createdPosts) ? createdPosts.length : 1
          );
          progress.day = day;
          progress.postInDay = postInDay + 1;
          progress.videoIndex = pool.index;
          progress.completedCount = completedCount;
          progress.totalCount = totalCount;
          progress.percentage = Math.floor((completedCount / totalCount) * 100);
          progress.status = "running";
          progress.completed = false;
          progress.campaignSlug = campaignSlug;
          progress.startDate = startDate;
          progress.videoDir = videoDir;
          progress.error = null;

          await saveProgress(progress);
        } catch (error) {
          console.error("bulk publish item failed:", error.message);
          continue;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, randomInt(300, 1200))
        );
      }

      postInDay = 0;
    }

    progress.percentage = 100;
    progress.completed = true;
    progress.status = "completed";
    progress.error = null;
    await saveProgress(progress);
  } catch (error) {
    console.error("pipeline error:", error.message);
    await saveProgress({
      ...(progress || {}),
      completed: false,
      status: "failed",
      error: error.message,
      percentage: progress?.percentage ?? 0,
      campaignSlug: campaignSlug || null,
      startDate: startDate || null,
      videoDir: videoDir || null,
    });
  }
}
