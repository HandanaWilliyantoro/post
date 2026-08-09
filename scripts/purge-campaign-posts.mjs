import "dotenv/config";
import axios from "axios";
import { MongoClient } from "mongodb";

const campaignSlug = String(process.argv[2] || "").trim();
if (!campaignSlug) {
  console.error("Usage: node scripts/purge-campaign-posts.mjs <campaign-slug>");
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
  timeout: 60000,
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  validateStatus: () => true,
});

const MIN_GAP_MS = 2500;
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
  if (raw == null || raw === "") return 70_000;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    if (asNumber <= 600) return Math.max(2000, asNumber * 1000);
    return 70_000;
  }

  return 70_000;
}

async function deleteRemotePost(id) {
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    await pace();
    const response = await http.delete(
      `/social-posts/${encodeURIComponent(id)}`
    );

    if ([200, 204, 404].includes(response.status)) {
      return { ok: true, status: response.status, missing: response.status === 404 };
    }

    const message = String(
      response.data?.message ||
        response.data?.error?.message ||
        response.data?.error ||
        `HTTP ${response.status}`
    );

    if (message.toLowerCase().includes("can only delete")) {
      return { ok: false, skipped: true, message };
    }

    const retryable =
      response.status === 429 ||
      response.status === 408 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504 ||
      response.status >= 500;

    if (!retryable || attempt === 25) {
      return { ok: false, status: response.status, message };
    }

    const delay = parseRetryAfterMs(response.headers);
    console.warn(
      `DELETE ${id} -> ${response.status}, retry ${attempt}/25 in ${Math.round(delay / 1000)}s`
    );
    await sleep(delay);
  }

  return { ok: false, message: "exhausted retries" };
}

async function main() {
  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db(dbName);
  const postsCol = db.collection("posts");

  // Abort active bulk runs for this campaign first
  const now = new Date().toISOString();
  const abort = await db.collection("progress").updateMany(
    {
      campaignSlug,
      status: { $in: ["queued", "running", "cancelling"] },
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
  if (abort.modifiedCount) {
    console.log(`Aborted bulk runs: ${abort.modifiedCount}`);
  }

  const localPosts = await postsCol
    .find({ campaignSlug }, { projection: { id: 1, status: 1, _id: 1 } })
    .toArray();

  console.log(`Campaign ${campaignSlug}: ${localPosts.length} local posts`);
  console.log("Deleting one-by-one: PostForMe first, then local...");

  let remoteDeleted = 0;
  let remoteSkipped = 0;
  let remoteFailed = 0;
  let localDeleted = 0;

  for (let index = 0; index < localPosts.length; index += 1) {
    const post = localPosts[index];
    const id = String(post?.id || "").trim();
    const mongoId = post._id;

    // 1) Delete on PostForMe first (if remote id)
    if (id && !id.startsWith("local_")) {
      const result = await deleteRemotePost(id);

      if (result.ok) {
        remoteDeleted += 1;
      } else if (result.skipped) {
        remoteSkipped += 1;
        console.warn(`Skip remote ${id}: ${result.message}`);
      } else {
        remoteFailed += 1;
        console.error(`Failed remote ${id}: ${result.message}`);
        // Still remove local so UI is clean; log failure
      }
    }

    // 2) Delete local immediately after remote attempt
    const del = await postsCol.deleteOne({ _id: mongoId });
    if (del.deletedCount) {
      localDeleted += 1;
    }

    if ((index + 1) % 10 === 0 || index + 1 === localPosts.length) {
      console.log(
        `Progress ${index + 1}/${localPosts.length} local=${localDeleted} remoteOk=${remoteDeleted} skipped=${remoteSkipped} failed=${remoteFailed}`
      );
    }
  }

  // Clear any stragglers by campaignSlug
  const leftover = await postsCol.deleteMany({ campaignSlug });
  if (leftover.deletedCount) {
    console.log(`Cleared leftover local posts: ${leftover.deletedCount}`);
    localDeleted += leftover.deletedCount;
  }

  for (const name of ["progress", "bulk_publish_progress"]) {
    try {
      const result = await db.collection(name).deleteMany({ campaignSlug });
      if (result.deletedCount) {
        console.log(`Cleared ${name}: ${result.deletedCount}`);
      }
    } catch {
      // ignore
    }
  }

  const remainingLocal = await postsCol.countDocuments({ campaignSlug });
  await mongo.close();

  console.log(
    JSON.stringify(
      {
        campaignSlug,
        localDeleted,
        remoteDeleted,
        remoteSkippedProcessed: remoteSkipped,
        remoteFailed,
        remainingLocal,
        note:
          "Each post: PostForMe delete first, then local. Processed posts cannot be deleted on PostForMe.",
      },
      null,
      2
    )
  );

  if (remoteFailed > 0 || remainingLocal > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
