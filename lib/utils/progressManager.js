import { getDb } from "@/lib/db";

const COLLECTION = "progress";
const JOB_ID = "bulk-publish";

const DEFAULT_PROGRESS = {
  accountIndex: 0,
  day: 0,
  postInDay: 0,
  videoIndex: 0,
  completedCount: 0,
  totalCount: 0,
  percentage: 0,
  completed: false,
  status: "idle",
  campaignSlug: null,
  startDate: null,
  videoDir: null,
  error: null,
};

export async function loadProgress() {
  const db = await getDb();
  const progress = await db.collection(COLLECTION).findOne({ jobId: JOB_ID });

  if (!progress) {
    return { ...DEFAULT_PROGRESS };
  }

  return {
    ...DEFAULT_PROGRESS,
    accountIndex: progress.accountIndex ?? 0,
    day: progress.day ?? 0,
    postInDay: progress.postInDay ?? 0,
    videoIndex: progress.videoIndex ?? 0,
    completedCount: progress.completedCount ?? 0,
    totalCount: progress.totalCount ?? 0,
    percentage: progress.percentage ?? 0,
    completed: progress.completed ?? false,
    status: progress.status || "idle",
    campaignSlug: progress.campaignSlug || null,
    startDate: progress.startDate || null,
    videoDir: progress.videoDir || null,
    error: progress.error || null,
  };
}

export async function saveProgress(progress) {
  const db = await getDb();

  const safeProgress = {
    accountIndex: progress.accountIndex ?? 0,
    day: progress.day ?? 0,
    postInDay: progress.postInDay ?? 0,
    videoIndex: progress.videoIndex ?? 0,
    completedCount: progress.completedCount ?? 0,
    totalCount: progress.totalCount ?? 0,
    percentage: progress.percentage ?? 0,
    completed: progress.completed ?? false,
    status: progress.status || "idle",
    campaignSlug: progress.campaignSlug || null,
    startDate: progress.startDate || null,
    videoDir: progress.videoDir || null,
    error: progress.error || null,
    jobId: JOB_ID,
    updatedAt: new Date(),
  };

  await db.collection(COLLECTION).updateOne(
    { jobId: JOB_ID },
    { $set: safeProgress },
    { upsert: true }
  );
}

export async function resetProgress(overrides = {}) {
  await saveProgress({
    ...DEFAULT_PROGRESS,
    ...overrides,
  });
}
