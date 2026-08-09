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
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    if (asNumber <= 600) return Math.max(1000, asNumber * 1000);
    return 65_000;
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

function isTikTok(account) {
  const platform = String(account?.platform || "").trim().toLowerCase();
  return platform === "tiktok" || platform === "tiktok_business" || platform.includes("tiktok");
}

async function listTikTokAccounts() {
  const accounts = [];
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < 500; page += 1) {
    const response = await api("get", "/social-accounts", {
      params: {
        limit,
        offset,
        platform: "tiktok",
      },
    });

    if (response.status >= 400) {
      // fallback without platform filter
      break;
    }

    const items = Array.isArray(response.data?.data)
      ? response.data.data
      : Array.isArray(response.data)
        ? response.data
        : [];

    accounts.push(...items.filter(isTikTok));
    console.log(`List page ${page + 1}: +${items.length} tiktok so far ${accounts.length}`);

    if (!items.length || !response.data?.meta?.next) break;
    offset += items.length;
  }

  if (accounts.length) {
    return accounts;
  }

  // Fallback: list all platforms and filter
  console.log("Falling back to full social-accounts list...");
  offset = 0;
  for (let page = 0; page < 500; page += 1) {
    const response = await api("get", "/social-accounts", {
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

    const tiktok = items.filter(isTikTok);
    accounts.push(...tiktok);
    console.log(
      `All-accounts page ${page + 1}: +${items.length} (tiktok ${tiktok.length}, total ${accounts.length})`
    );

    if (!items.length || !response.data?.meta?.next) break;
    offset += items.length;
  }

  return accounts;
}

async function disconnectAccount(id) {
  const response = await api(
    "post",
    `/social-accounts/${encodeURIComponent(id)}/disconnect`
  );

  if (
    response.status === 200 ||
    response.status === 201 ||
    response.status === 204 ||
    response.status === 404
  ) {
    return { ok: true, status: response.status };
  }

  // already disconnected
  const message = String(
    response.data?.message || response.data?.error?.message || response.data?.error || ""
  ).toLowerCase();

  if (
    message.includes("already") ||
    message.includes("disconnect") ||
    response.status === 409
  ) {
    return { ok: true, status: response.status, note: message };
  }

  return {
    ok: false,
    status: response.status,
    message:
      response.data?.message ||
      response.data?.error?.message ||
      response.data?.error ||
      `HTTP ${response.status}`,
  };
}

async function deleteAccount(id) {
  const response = await api("delete", `/social-accounts/${encodeURIComponent(id)}`);

  if (
    response.status === 200 ||
    response.status === 204 ||
    response.status === 404
  ) {
    return { ok: true, status: response.status };
  }

  return {
    ok: false,
    status: response.status,
    message:
      response.data?.message ||
      response.data?.error?.message ||
      response.data?.error ||
      `HTTP ${response.status}`,
  };
}

async function main() {
  console.log("Listing TikTok accounts on PostForMe...");
  const accounts = await listTikTokAccounts();
  console.log(`Found ${accounts.length} TikTok accounts`);

  // Dedupe by id
  const byId = new Map();
  for (const account of accounts) {
    const id = String(account?.id || "").trim();
    if (id) byId.set(id, account);
  }

  const list = [...byId.values()];
  console.log(`Unique TikTok accounts: ${list.length}`);

  let disconnected = 0;
  let disconnectFailed = 0;
  let deleted = 0;
  let deleteFailed = 0;

  for (let index = 0; index < list.length; index += 1) {
    const account = list[index];
    const id = String(account.id).trim();
    const username = String(account.username || account.display_name || "").trim();

    const disc = await disconnectAccount(id);
    if (disc.ok) {
      disconnected += 1;
    } else {
      disconnectFailed += 1;
      console.error(`Disconnect failed ${id} (@${username}): ${disc.message}`);
    }

    const del = await deleteAccount(id);
    if (del.ok) {
      deleted += 1;
    } else {
      deleteFailed += 1;
      console.error(`Delete failed ${id} (@${username}): ${del.message}`);
    }

    if ((index + 1) % 10 === 0 || index + 1 === list.length) {
      console.log(
        `Progress ${index + 1}/${list.length} disconnected=${disconnected} deleted=${deleted} discFail=${disconnectFailed} delFail=${deleteFailed}`
      );
    }
  }

  // Clean local Mongo accounts (tiktok)
  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db(dbName);

  const localFilter = {
    $or: [
      { platform: { $regex: /^tiktok/i } },
      { platform: { $regex: /tiktok/i } },
    ],
  };

  const localCount = await db.collection("accounts").countDocuments(localFilter);
  const localDelete = await db.collection("accounts").deleteMany(localFilter);
  console.log(`Local TikTok accounts removed: ${localDelete.deletedCount} (matched ${localCount})`);

  // Also remove by remote ids if any remain with different platform label
  const remoteIds = list.map((a) => String(a.id).trim()).filter(Boolean);
  if (remoteIds.length) {
    const byIdDelete = await db.collection("accounts").deleteMany({
      id: { $in: remoteIds },
    });
    if (byIdDelete.deletedCount) {
      console.log(`Local accounts removed by remote id: ${byIdDelete.deletedCount}`);
    }
  }

  // Verify remote remaining
  console.log("Verifying remaining TikTok accounts on PostForMe...");
  const remaining = await listTikTokAccounts();
  const remainingLocal = await db.collection("accounts").countDocuments(localFilter);

  await mongo.close();

  console.log(
    JSON.stringify(
      {
        remoteFound: list.length,
        disconnected,
        disconnectFailed,
        deleted,
        deleteFailed,
        remainingRemoteTikTok: remaining.length,
        remainingLocalTikTok: remainingLocal,
      },
      null,
      2
    )
  );

  if (deleteFailed > 0 || remaining.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
