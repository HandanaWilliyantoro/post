import "dotenv/config";
import axios from "axios";
import { MongoClient } from "mongodb";

const campaignSlug = String(process.argv[2] || "").trim();
if (!campaignSlug) {
  console.error("Usage: node scripts/abort-and-purge-campaign.mjs <campaign-slug>");
  process.exit(1);
}

const baseUrl = String(process.env.POSTFORME_BASE_URL || "https://api.postforme.dev/v1")
  .trim()
  .replace(/\/+$/, "");
const apiKey = String(process.env.POSTFORME_API_KEY || "").trim();
const mongoUri = String(process.env.MONGODB_URI || "").trim();
const dbName = String(process.env.MONGODB_DB || "development").trim();

if (!apiKey) throw new Error("POSTFORME_API_KEY is not configured");
if (!mongoUri) throw new Error("MONGODB_URI is not configured");

const http = axios.create({
  baseURL: baseUrl,
  timeout: 45000,
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  validateStatus: () => true,
});

const MIN_GAP_MS = 2200;
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.min(Math.max(0, Number(ms) || 0), 180_000))
  );
}

async function pace() {
  const now = Date.now();
  const wait = MIN_GAP_MS - (now - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

function parseRetryAfterMs(headers = {}) {
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  if (raw == null || raw === "") return 65_000;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber >= 0 && asNumber <= 600) {
    return Math.max(1000, asNumber * 1000);
  }
  return 65_000;
}

async function api(method, url, config = {}) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await pace();
    const response = await http.request({ method, url, ...config });
    if (response.status === 429 || response.status === 408 || response.status >= 500) {
      const delay = parseRetryAfterMs(response.headers);
      console.warn(
        `${method.toUpperCase()} ${url} -> ${response.status}, wait ${Math.round(delay / 1000)}s`
      );
      await sleep(delay);
      continue;
    }
    return response;
  }
  throw new Error(`${method.toUpperCase()} ${url} failed after retries`);
}

async function deleteRemotePost(id) {
  const response = await api("delete", `/social-posts/${encodeURIComponent(id)}`);
  if ([200, 204, 404].includes(response.status)) {
    return { ok: true, status: response.status };
  }
  const message =
    response.data?.message ||
    response.data?.error?.message ||
    response.data?.error ||
    `HTTP ${response.status}`;
  return { ok: false, status: response.status, message: String(message) };
}

async function main() {
  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db(dbName);
  const now = new Date().toISOString();

  // 1) Abort all active bulk publish runs for this campaign
  const activeStatuses = ["queued", "running", "cancelling"];
  const activeRuns = await db
    .collection("progress")
    .find({
      campaignSlug,
      status: { $in: activeStatuses },
    })
    .project({ runId: 1, status: 1 })
    .toArray();

  console.log(`Active bulk runs to abort: ${activeRuns.length}`);

  if (activeRuns.length) {
    const abortResult = await db.collection("progress").updateMany(
      {
        campaignSlug,
        status: { $in: activeStatuses },
      },
      {
        $set: {
          status: "cancelled",
          completed: true,
          cancelRequested: true,
          cancelRequestedAt: now,
          finishedAt: now,
          updatedAt: now,
          lastError: "Aborted by campaign purge",
          workerClaimedAt: null,
          percentage: 100,
        },
      }
    );
    console.log(`Marked cancelled in progress: ${abortResult.modifiedCount}`);
  }

  // Also mark completed runs stay; user asked delete posts from completed too
  // Clear all progress docs for campaign after abort
  // First collect post ids then delete posts

  const localPosts = await db
    .collection("posts")
    .find({ campaignSlug }, { projection: { id: 1, status: 1 } })
    .toArray();

  console.log(`Local posts: ${localPosts.length}`);

  const remoteIds = [
    ...new Set(
      localPosts
        .map((post) => String(post?.id || "").trim())
        .filter((id) => id && !id.startsWith("local_"))
    ),
  ];

  console.log(`Remote PostForMe ids: ${remoteIds.length}`);

  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < remoteIds.length; index += 1) {
    const id = remoteIds[index];
    const result = await deleteRemotePost(id);

    if (result.ok) deleted += 1;
    else if (String(result.message || "").toLowerCase().includes("can only delete")) {
      skipped += 1;
    } else {
      failed += 1;
      console.error(`Failed ${id}: ${result.message}`);
    }

    if ((index + 1) % 25 === 0 || index + 1 === remoteIds.length) {
      console.log(
        `Remote ${index + 1}/${remoteIds.length} deleted=${deleted} skipped=${skipped} failed=${failed}`
      );
    }
  }

  const localDelete = await db.collection("posts").deleteMany({ campaignSlug });
  console.log(`Deleted local posts: ${localDelete.deletedCount}`);

  const progressDelete = await db.collection("progress").deleteMany({ campaignSlug });
  console.log(`Deleted progress runs: ${progressDelete.deletedCount}`);

  const remainingLocal = await db.collection("posts").countDocuments({ campaignSlug });
  const remainingProgress = await db.collection("progress").countDocuments({ campaignSlug });

  await mongo.close();

  console.log(
    JSON.stringify(
      {
        campaignSlug,
        abortedRuns: activeRuns.length,
        localDeleted: localDelete.deletedCount,
        progressDeleted: progressDelete.deletedCount,
        remoteDeleted: deleted,
        remoteSkippedProcessed: skipped,
        remoteFailed: failed,
        remainingLocal,
        remainingProgress,
      },
      null,
      2
    )
  );

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
