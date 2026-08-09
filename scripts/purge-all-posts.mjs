import "dotenv/config";
import axios from "axios";
import { MongoClient } from "mongodb";

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

// Stay under 40/min: ~1 request every 1.7s
const MIN_GAP_MS = 1700;
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
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    // HTTP Retry-After is seconds unless absurdly large
    if (asNumber <= 600) return Math.max(1000, asNumber * 1000);
    return 65_000;
  }

  const asDate = Date.parse(String(raw));
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    if (delta > 0 && delta <= 180_000) return delta;
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
        `${method.toUpperCase()} ${url} -> ${response.status}, wait ${Math.round(delay / 1000)}s (try ${attempt}/20)`
      );
      await sleep(delay);
      continue;
    }

    return response;
  }

  throw new Error(`${method.toUpperCase()} ${url} failed after retries`);
}

async function listAllRemotePosts() {
  const posts = [];
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < 2000; page += 1) {
    const response = await api("get", "/social-posts", {
      params: { limit, offset },
    });

    if (response.status >= 400) {
      throw new Error(`List failed ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const items = Array.isArray(response.data?.data)
      ? response.data.data
      : Array.isArray(response.data)
        ? response.data
        : [];

    posts.push(...items);
    console.log(`List page ${page + 1}: +${items.length} (total ${posts.length})`);

    if (!items.length || !response.data?.meta?.next) break;
    offset += items.length;
  }

  return posts;
}

async function deleteRemotePost(id) {
  const response = await api("delete", `/social-posts/${encodeURIComponent(id)}`);

  if (response.status === 200 || response.status === 204 || response.status === 404) {
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

  const localCount = await db.collection("posts").countDocuments();
  if (localCount > 0) {
    const localDelete = await db.collection("posts").deleteMany({});
    console.log(`Deleted local posts: ${localDelete.deletedCount}`);
  } else {
    console.log("Local posts already empty");
  }

  for (const name of ["progress", "bulk_publish_progress"]) {
    try {
      const result = await db.collection(name).deleteMany({});
      if (result.deletedCount) console.log(`Cleared ${name}: ${result.deletedCount}`);
    } catch {
      // ignore
    }
  }

  console.log("Listing remaining PostForMe posts...");
  let remotePosts = await listAllRemotePosts();
  console.log(`Remote remaining: ${remotePosts.length}`);

  const byStatus = {};
  for (const post of remotePosts) {
    const status = String(post?.status || "unknown").toLowerCase();
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  console.log("Status breakdown:", byStatus);

  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  // Prefer scheduled/draft first
  remotePosts = [
    ...remotePosts.filter((p) =>
      ["scheduled", "draft", "pending", "processing", "process"].includes(
        String(p?.status || "").toLowerCase()
      )
    ),
    ...remotePosts.filter(
      (p) =>
        !["scheduled", "draft", "pending", "processing", "process"].includes(
          String(p?.status || "").toLowerCase()
        )
    ),
  ];

  for (let index = 0; index < remotePosts.length; index += 1) {
    const post = remotePosts[index];
    const id = String(post?.id || "").trim();
    if (!id) continue;

    const status = String(post?.status || "").toLowerCase();
    const result = await deleteRemotePost(id);

    if (result.ok) {
      deleted += 1;
    } else if (String(result.message || "").toLowerCase().includes("can only delete")) {
      skipped += 1;
    } else {
      failed += 1;
      console.error(`Failed ${id} (${status}): ${result.message}`);
    }

    if ((index + 1) % 25 === 0 || index + 1 === remotePosts.length) {
      console.log(
        `Progress ${index + 1}/${remotePosts.length} deleted=${deleted} skipped=${skipped} failed=${failed}`
      );
    }
  }

  const remaining = await listAllRemotePosts();
  const remainingByStatus = {};
  for (const post of remaining) {
    const status = String(post?.status || "unknown").toLowerCase();
    remainingByStatus[status] = (remainingByStatus[status] || 0) + 1;
  }

  const finalLocal = await db.collection("posts").countDocuments();
  await mongo.close();

  console.log(
    JSON.stringify(
      {
        localPostsRemaining: finalLocal,
        remoteDeletedThisRun: deleted,
        remoteSkippedProcessed: skipped,
        remoteFailed: failed,
        remainingRemote: remaining.length,
        remainingByStatus,
        note:
          "PostForMe only deletes scheduled/draft. Processed posts stay on PostForMe; local Mongo is empty.",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
