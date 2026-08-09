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

function isInstagram(account) {
  const platform = String(account?.platform || "").trim().toLowerCase();
  return platform === "instagram" || platform.includes("instagram");
}

function isAssignedLocal(row) {
  const slugs = Array.isArray(row?.campaignSlugs)
    ? row.campaignSlugs.map((s) => String(s || "").trim()).filter(Boolean)
    : [];
  const primary = String(row?.campaignSlug || "").trim();
  if (slugs.length || primary) return true;
  return String(row?.assignmentStatus || "").trim().toLowerCase() === "assigned";
}

async function listInstagramAccounts() {
  const accounts = [];
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < 500; page += 1) {
    const response = await api("get", "/social-accounts", {
      params: { limit, offset, platform: "instagram" },
    });

    if (response.status >= 400) break;

    const items = Array.isArray(response.data?.data)
      ? response.data.data
      : Array.isArray(response.data)
        ? response.data
        : [];

    accounts.push(...items.filter(isInstagram));
    console.log(`IG list page ${page + 1}: +${items.length} total ${accounts.length}`);

    if (!items.length || !response.data?.meta?.next) break;
    offset += items.length;
  }

  if (accounts.length) return accounts;

  console.log("Falling back to full account list...");
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
    const ig = items.filter(isInstagram);
    accounts.push(...ig);
    console.log(
      `All page ${page + 1}: +${items.length} ig +${ig.length} total ${accounts.length}`
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
  if ([200, 201, 204, 404, 409].includes(response.status)) {
    return { ok: true, status: response.status };
  }
  return {
    ok: false,
    message:
      response.data?.message ||
      response.data?.error?.message ||
      response.data?.error ||
      `HTTP ${response.status}`,
  };
}

async function deleteAccount(id) {
  const response = await api("delete", `/social-accounts/${encodeURIComponent(id)}`);
  if ([200, 204, 404].includes(response.status)) {
    return { ok: true, status: response.status };
  }
  return {
    ok: false,
    message:
      response.data?.message ||
      response.data?.error?.message ||
      response.data?.error ||
      `HTTP ${response.status}`,
  };
}

async function main() {
  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db(dbName);

  const localIg = await db
    .collection("accounts")
    .find({ platform: { $regex: /instagram/i } })
    .toArray();

  const assignedIds = new Set();
  const assignedUsernames = new Set();

  for (const row of localIg) {
    if (!isAssignedLocal(row)) continue;
    const id = String(row?.id || "").trim();
    const username = String(row?.username || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    if (id) assignedIds.add(id);
    if (username) assignedUsernames.add(username);
  }

  console.log(
    `Local IG: ${localIg.length} total, assigned ids=${assignedIds.size} usernames=${assignedUsernames.size}`
  );

  console.log("Listing Instagram accounts on PostForMe...");
  const remote = await listInstagramAccounts();
  const byId = new Map();
  for (const account of remote) {
    const id = String(account?.id || "").trim();
    if (id) byId.set(id, account);
  }
  console.log(`Remote IG unique: ${byId.size}`);

  const targets = [];
  for (const account of byId.values()) {
    const id = String(account.id).trim();
    const username = String(account.username || account.display_name || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "");

    if (assignedIds.has(id) || (username && assignedUsernames.has(username))) {
      continue;
    }

    targets.push(account);
  }

  // Local-only unassigned rows (no valid remote id still clean up)
  const localUnassigned = localIg.filter((row) => !isAssignedLocal(row));
  console.log(
    `Unassigned remote IG to remove: ${targets.length}; local unassigned rows: ${localUnassigned.length}`
  );

  let disconnected = 0;
  let deleted = 0;
  let discFail = 0;
  let delFail = 0;

  for (let index = 0; index < targets.length; index += 1) {
    const account = targets[index];
    const id = String(account.id).trim();
    const username = String(account.username || "").trim();

    const disc = await disconnectAccount(id);
    if (disc.ok) disconnected += 1;
    else {
      discFail += 1;
      console.error(`Disconnect fail ${id} @${username}: ${disc.message}`);
    }

    const del = await deleteAccount(id);
    if (del.ok) deleted += 1;
    else {
      delFail += 1;
      console.error(`Delete fail ${id} @${username}: ${del.message}`);
    }

    if ((index + 1) % 10 === 0 || index + 1 === targets.length) {
      console.log(
        `Progress ${index + 1}/${targets.length} disc=${disconnected} del=${deleted} discFail=${discFail} delFail=${delFail}`
      );
    }
  }

  // Remove local unassigned IG accounts
  const unassignedIds = [
    ...new Set([
      ...localUnassigned.map((r) => String(r.id || "").trim()).filter(Boolean),
      ...targets.map((a) => String(a.id || "").trim()).filter(Boolean),
    ]),
  ];

  const localDelete = await db.collection("accounts").deleteMany({
    platform: { $regex: /instagram/i },
    $or: [
      { assignmentStatus: { $ne: "assigned" } },
      { campaignSlug: "" },
      { campaignSlug: { $exists: false } },
      { campaignSlugs: { $size: 0 } },
      { campaignSlugs: { $exists: false } },
    ],
    // keep any that are actually assigned
    id: { $nin: [...assignedIds] },
  });

  // Safer second pass: delete only explicitly unassigned locals
  const localDelete2 = await db.collection("accounts").deleteMany({
    platform: { $regex: /instagram/i },
    assignmentStatus: { $ne: "assigned" },
    $and: [
      {
        $or: [
          { campaignSlug: "" },
          { campaignSlug: { $exists: false } },
          { campaignSlug: null },
        ],
      },
      {
        $or: [
          { campaignSlugs: { $exists: false } },
          { campaignSlugs: { $size: 0 } },
          { campaignSlugs: [] },
        ],
      },
    ],
  });

  // Also remove deleted remote ids from local regardless
  if (unassignedIds.length) {
    await db.collection("accounts").deleteMany({
      id: { $in: unassignedIds },
      platform: { $regex: /instagram/i },
      assignmentStatus: { $ne: "assigned" },
    });
  }

  const remainingAssigned = await db.collection("accounts").countDocuments({
    platform: { $regex: /instagram/i },
    assignmentStatus: "assigned",
  });
  const remainingLocalIg = await db.collection("accounts").countDocuments({
    platform: { $regex: /instagram/i },
  });

  console.log("Verifying remaining unassigned remote IG...");
  const remainingRemote = await listInstagramAccounts();
  const remainingUnassignedRemote = remainingRemote.filter((account) => {
    const id = String(account?.id || "").trim();
    const username = String(account?.username || account?.display_name || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    return !(assignedIds.has(id) || (username && assignedUsernames.has(username)));
  });

  await mongo.close();

  console.log(
    JSON.stringify(
      {
        assignedPreserved: assignedIds.size,
        remoteUnassignedTargeted: targets.length,
        disconnected,
        deleted,
        discFail,
        delFail,
        localDeleteApprox: localDelete.deletedCount + localDelete2.deletedCount,
        remainingLocalIg,
        remainingAssignedLocal: remainingAssigned,
        remainingUnassignedRemote: remainingUnassignedRemote.length,
      },
      null,
      2
    )
  );

  if (delFail > 0 || remainingUnassignedRemote.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
