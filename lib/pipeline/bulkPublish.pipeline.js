import fs from "fs";
import path from "path";

import { getAccounts } from "@/lib/accounts/getAccounts";
import { publishVideo } from "@/lib/pipeline/publishVideo";
import { VideoPool } from "@/lib/utils/videoPool";
import {
  loadProgress,
  saveProgress,
} from "@/lib/utils/progressManager";
import { getRandomCaption } from "@/lib/utils/getRandomCaption";

const POSTS_PER_DAY = 20;
const DAYS = 30;
const TOTAL_POSTS = POSTS_PER_DAY * DAYS;

/**
 * Load videos safely (no folder crash)
 */
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
        buffer: fs.readFileSync(fullPath),
      };
    })
    .filter(Boolean);
}

/**
 * Generate schedule (SAFE)
 */
export function generateScheduleEST({
  totalPosts,
  postsPerDay = 20,
}) {
  const schedule = [];

  const now = new Date();

  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);

  let currentDate = new Date(start);
  let count = 0;

  while (count < totalPosts) {
    for (let i = 0; i < postsPerDay; i++) {
      if (count >= totalPosts) break;

      const date = new Date(currentDate);
      date.setHours(8 + i, 0, 0, 0);

      if (date <= now) {
        date.setDate(date.getDate() + 1);
      }

      schedule.push(date.toISOString());
      count++;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return schedule;
}

/**
 * MAIN PIPELINE
 */
export async function bulkPublishPipeline({ videoDir }) {
  try {
    console.log("🚀 Starting bulk publish pipeline...");

    // 🔹 Load progress
    const progress = await loadProgress();

    console.log("📌 Loaded progress:", progress);

    // 🔹 Load videos
    const videos = loadVideos(videoDir);

    if (!videos.length) {
      throw new Error("No videos found");
    }

    console.log(`📦 Loaded ${videos.length} videos`);

    // 🔹 Video pool
    const pool = new VideoPool(videos, progress.videoIndex || 0);

    // 🔹 Accounts
    const accounts = await getAccounts();

    if (!accounts.length) {
      throw new Error("No accounts found");
    }

    console.log(`👤 Found ${accounts.length} accounts`);

    // 🔥 TOTAL (IMPORTANT FIX)
    const TOTAL = accounts.length * TOTAL_POSTS;

    // 🔹 Generate schedule ONCE
    const scheduleTimes = generateScheduleEST({
      totalPosts: TOTAL_POSTS,
      postsPerDay: POSTS_PER_DAY,
    });

    // 🔹 Global schedule index
    let scheduleIndex =
      (progress.accountIndex || 0) * TOTAL_POSTS +
      (progress.postIndex || 0);

    // 🔹 Loop accounts
    for (
      let a = progress.accountIndex || 0;
      a < accounts.length;
      a++
    ) {
      const account = accounts[a];

      console.log(
        `\n🎯 Processing account (${a + 1}/${accounts.length}): ${
          account.username || account.id
        }`
      );

      // 🔹 Loop posts
      for (
        let p = progress.postIndex || 0;
        p < TOTAL_POSTS;
        p++
      ) {
        const video = pool.next();

        const publishAt = scheduleTimes[p];

        if (!publishAt) {
          throw new Error(`Missing publishAt at index ${p}`);
        }

        console.log(
          `📤 ${account.username || account.id} → Post ${
            p + 1
          }/${TOTAL_POSTS}`
        );

        const caption = getRandomCaption();

        try {
          // ✅ PROGRESS TRACKING (FIXED)
          progress.completedPosts =
            (progress.completedPosts || 0) + 1;

          progress.totalPosts = TOTAL;

          progress.percentage = Math.floor(
            (progress.completedPosts / TOTAL) * 100
          );

          progress.accountIndex = a;
          progress.postIndex = p + 1;
          progress.videoIndex = pool.index;

          console.log("📊 PROGRESS:", {
            completed: progress.completedPosts,
            total: progress.totalPosts,
            percentage: progress.percentage,
          });

          await saveProgress(progress);
          
          await publishVideo({
            file: video,
            accountIds: [account.id],
            content: caption,
            publishAt,
          });
        } catch (err) {
          console.error(
            "❌ Failed post:",
            err.response?.data || err.message
          );
          continue;
        }

        // 🔥 prevent blocking (IMPORTANT for SSE)
        await new Promise((r) => setTimeout(r, 0));
      }

      console.log(
        `✅ Finished account: ${account.username || account.id}`
      );

      // 🔹 Move to next account
      progress.postIndex = 0;
      progress.accountIndex = a + 1;

      await saveProgress(progress);
    }

    console.log("🎉 ALL ACCOUNTS COMPLETED");

    // 🔹 Reset after completion
    await saveProgress({
      accountIndex: 0,
      postIndex: 0,
      videoIndex: 0,
      completedPosts: 0,
      totalPosts: TOTAL,
      percentage: 100,
    });
  } catch (error) {
    console.error(
      "❌ Bulk pipeline error:",
      error.response?.data || error.message
    );
  }
}