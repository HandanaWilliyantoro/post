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
  timeout: 60000,
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
  if (raw == null || raw === "") return 70_000;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber >= 0 && asNumber <= 600) {
    return Math.max(2000, asNumber * 1000);
  }
  return 70_000;
}

async function deleteRemotePost(id) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    await pace();
    const response = await http.delete(`/social-posts/${encodeURIComponent(id)}`);

    if ([200, 204, 404].includes(response.status)) {
      return { ok: true, status: response.status };
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
      response.status >= 500;

    if (!retryable || attempt === 20) {
      return { ok: false, message, status: response.status };
    }

    const delay = parseRetryAfterMs(response.headers);
    console.warn(
      `DELETE ${id} -> ${response.status}, retry ${attempt}/20 in ${Math.round(delay / 1000)}s`
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

  const scheduledFilter = { status: { $regex: /^scheduled$/i } };
  const posts = await postsCol
    .find(scheduledFilter, { projection: { id: 1, campaignSlug: 1, _id: 1, status: 1 } })
    .toArray();

  console.log(`Scheduled posts to purge: ${posts.length}`);

  let remoteDeleted = 0;
  let remoteSkipped = 0;
  let remoteFailed = 0;
  let localDeleted = 0;

  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];
    const id = String(post?.id || "").trim();

    if (id && !id.startsWith("local_")) {
      const result = await deleteRemotePost(id);
      if (result.ok) remoteDeleted += 1;
      else if (result.skipped) {
        remoteSkipped += 1;
        console.warn(`Skip remote ${id}: ${result.message}`);
      } else {
        remoteFailed += 1;
        console.error(`Failed remote ${id}: ${result.message}`);
      }
    }

    const del = await postsCol.deleteOne({ _id: post._id });
    if (del.deletedCount) localDeleted += 1;

    if ((index + 1) % 25 === 0 || index + 1 === posts.length) {
      console.log(
        `Progress ${index + 1}/${posts.length} local=${localDeleted} remoteOk=${remoteDeleted} skipped=${remoteSkipped} failed=${remoteFailed}`
      );
    }
  }

  // Safety: wipe any remaining scheduled by status
  const leftover = await postsCol.deleteMany(scheduledFilter);
  if (leftover.deletedCount) {
    console.log(`Cleared leftover scheduled locals: ${leftover.deletedCount}`);
    localDeleted += leftover.deletedCount;
  }

  const remainingScheduled = await postsCol.countDocuments(scheduledFilter);
  const remainingByCampaign = await postsCol
    .aggregate([{ $group: { _id: "$campaignSlug", n: { $sum: 1 } } }])
    .toArray();

  await mongo.close();

  console.log(
    JSON.stringify(
      {
        localDeleted,
        remoteDeleted,
        remoteSkipped,
        remoteFailed,
        remainingScheduled,
        remainingPostsByCampaign: remainingByCampaign,
      },
      null,
      2
    )
  );

  if (remoteFailed > 0 || remainingScheduled > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
