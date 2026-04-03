import { getDb } from "@/lib/db";

const COLLECTION = "progress";
const JOB_ID = "bulk-publish";

export async function loadProgress() {
  const db = await getDb();

  const progress = await db
    .collection(COLLECTION)
    .findOne({ jobId: JOB_ID });

  console.log(progress, '<< progress load')

  return (
    progress || {
      accountIndex: 0,
      postIndex: 0,
      videoIndex: 0,
      completedPosts: 0,
      totalPosts: 0,
      percentage: 0,
    }
  );
}

export async function saveProgress(progress) {
  const db = await getDb();

  console.log(progress, '<< save')

  // 🔥 ENSURE ALL FIELDS EXIST
  const safeProgress = {
    accountIndex: progress.accountIndex || 0,
    postIndex: progress.postIndex || 0,
    videoIndex: progress.videoIndex || 0,
    completedPosts: progress.completedPosts || 0,
    totalPosts: progress.totalPosts || 0,
    percentage: progress.percentage || 0,
    jobId: JOB_ID,
    updatedAt: new Date(),
  };

  console.log("💾 SAVING PROGRESS:", safeProgress);

  await db.collection(COLLECTION).updateOne(
    { jobId: JOB_ID },
    { $set: safeProgress },
    { upsert: true }
  );
}