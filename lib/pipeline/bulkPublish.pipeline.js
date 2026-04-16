import fs from "fs";
import path from "path";

import { getAccounts } from "@/lib/accounts/getAccounts";
import { publishVideo } from "@/lib/pipeline/publishVideo";
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

function generatePublishDate(startDate, dayIndex, postInDayIndex) {
  const timeZone = "America/New_York";
  const base = new Date(
    new Date(startDate).toLocaleString("en-US", { timeZone })
  );

  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + dayIndex);

  const startHour = 8 + randomInt(0, 2);
  let hourOffset = postInDayIndex;

  if (Math.random() < 0.1) {
    hourOffset += randomInt(1, 2);
  }

  base.setHours(startHour + hourOffset);
  base.setMinutes(randomInt(0, 10));

  return new Date(base.toLocaleString("en-US", { timeZone })).toISOString();
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

    const days = getDaysUntilEndOfMonth(startDate);
    const videos = loadVideos(videoDir);

    if (!videos.length) {
      throw new Error("No videos found");
    }

    const accounts = await getAccounts({ campaignSlug });

    if (!accounts.length) {
      throw new Error("No accounts");
    }

    const totalCount = days * 20;

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
      for (; postInDay < 20; postInDay++) {
        const video = pool.next();
        const publishAt = generatePublishDate(startDate, day, postInDay);
        const caption = getRandomCaption();

        try {
          await publishVideo({
            file: video,
            accountIds: accounts.map((account) => account.id),
            content: caption,
            publishAt,
            campaignSlug,
            sourceFilePath: video.path,
            origin: "bulk_queue",
          });

          completedCount++;
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
