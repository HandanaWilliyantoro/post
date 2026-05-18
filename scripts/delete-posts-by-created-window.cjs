#!/usr/bin/env node

require("dotenv").config();

const axios = require("axios");
const { MongoClient } = require("mongodb");
const { DateTime } = require("luxon");

const DEFAULT_TIMEZONE = "America/New_York";

function parseArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : "";
}

function parsePositiveHours(value) {
  const parsed = Number(String(value || "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildWindow() {
  const requestedDate = String(parseArg("date") || "").trim();
  const requestedHours = parsePositiveHours(parseArg("hours"));

  if (requestedDate) {
    const start = DateTime.fromISO(requestedDate, {
      zone: DEFAULT_TIMEZONE,
    }).startOf("day");

    if (!start.isValid) {
      throw new Error(`Invalid --date value: ${requestedDate}`);
    }

    const end = start.plus({ days: 1 });

    return {
      mode: "date",
      label: start.toFormat("yyyy-LL-dd"),
      start,
      end,
    };
  }

  const hours = requestedHours || 24;
  const end = DateTime.now().setZone(DEFAULT_TIMEZONE);
  const start = end.minus({ hours });

  return {
    mode: "rolling-hours",
    label: `last-${hours}-hours`,
    hours,
    start,
    end,
  };
}

function resolveStatusFilter() {
  if (process.argv.includes("--all-statuses")) {
    return "";
  }

  return String(parseArg("status") || "").trim().toLowerCase();
}

function buildPostonceClient() {
  const baseURL = String(process.env.POSTONCE_BASE_URL || "").trim();
  const apiKey = String(process.env.POSTONCE_API_KEY || "").trim();

  if (!baseURL || !apiKey) {
    throw new Error("POSTONCE credentials are not configured");
  }

  return axios.create({
    baseURL,
    proxy: false,
    timeout: 45000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

async function cancelRemotePost(client, postId) {
  try {
    await client.delete(`/posts/${postId}`);
    return { cancelled: true, alreadyMissing: false, error: null };
  } catch (error) {
    const status = Number(error?.response?.status || 0);

    if (status === 404) {
      return { cancelled: false, alreadyMissing: true, error: null };
    }

    return {
      cancelled: false,
      alreadyMissing: false,
      error:
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to cancel remote post",
    };
  }
}

function parseCreatedAt(post) {
  const value = String(post?.created_at || "").trim();
  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? parsed.toUTC() : null;
}

function matchesWindow(post, window) {
  const createdAt = parseCreatedAt(post);

  if (!createdAt) {
    return false;
  }

  return (
    createdAt.toMillis() >= window.start.toUTC().toMillis() &&
    createdAt.toMillis() < window.end.toUTC().toMillis()
  );
}

function matchesStatus(post, statusFilter) {
  if (!statusFilter) {
    return true;
  }

  return String(post?.status || "").trim().toLowerCase() === statusFilter;
}

function toSerializablePost(post) {
  return {
    id: String(post?.id || "").trim() || null,
    campaignSlug: String(post?.campaignSlug || "").trim() || null,
    status: String(post?.status || "").trim() || null,
    localOnly: post?.localOnly === true,
    created_at: String(post?.created_at || "").trim() || null,
    publish_at: String(post?.publish_at || "").trim() || null,
    contentPreview: String(post?.content || "").trim().slice(0, 120) || null,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mongoUri = String(process.env.MONGODB_URI || "").trim();
  const dbName = String(process.env.MONGODB_DB || "development").trim();
  const window = buildWindow();
  const statusFilter = resolveStatusFilter();

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();

  try {
    const db = mongo.db(dbName);
    const collection = db.collection("posts");
    const allPosts = await collection
      .find({})
      .project({
        _id: 0,
        id: 1,
        campaignSlug: 1,
        status: 1,
        localOnly: 1,
        created_at: 1,
        publish_at: 1,
        content: 1,
      })
      .toArray();

    const matchedPosts = allPosts
      .filter((post) => matchesWindow(post, window))
      .filter((post) => matchesStatus(post, statusFilter))
      .sort((left, right) => {
        const leftCreatedAt = parseCreatedAt(left)?.toMillis() || 0;
        const rightCreatedAt = parseCreatedAt(right)?.toMillis() || 0;

        if (leftCreatedAt !== rightCreatedAt) {
          return leftCreatedAt - rightCreatedAt;
        }

        const leftPublishAt = Date.parse(String(left?.publish_at || "").trim()) || 0;
        const rightPublishAt = Date.parse(String(right?.publish_at || "").trim()) || 0;

        return leftPublishAt - rightPublishAt;
      });

    const summary = {
      mode: window.mode,
      label: window.label,
      timezone: DEFAULT_TIMEZONE,
      createdAtRange: {
        startEt: window.start.toISO(),
        endEtExclusive: window.end.toISO(),
        startUtc: window.start.toUTC().toISO(),
        endUtcExclusive: window.end.toUTC().toISO(),
      },
      statusFilter: statusFilter || "all",
      totalMatched: matchedPosts.length,
      remoteCandidates: matchedPosts.filter((post) => post?.localOnly !== true).length,
      localOnlyCandidates: matchedPosts.filter((post) => post?.localOnly === true).length,
      sample: matchedPosts.slice(0, 25).map(toSerializablePost),
      deletedPosts: [],
      failedRemoteCancellations: [],
    };

    if (!apply || !matchedPosts.length) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const postonceClient = buildPostonceClient();

    for (const post of matchedPosts) {
      const postId = String(post?.id || "").trim();

      if (!postId) {
        summary.failedRemoteCancellations.push({
          id: null,
          created_at: post?.created_at || null,
          error: "Missing local post id",
        });
        continue;
      }

      if (post?.localOnly !== true) {
        const result = await cancelRemotePost(postonceClient, postId);

        if (result.error) {
          summary.failedRemoteCancellations.push({
            id: postId,
            created_at: post?.created_at || null,
            campaignSlug: post?.campaignSlug || null,
            status: post?.status || null,
            error: result.error,
          });
          continue;
        }
      }

      await collection.deleteOne({ id: postId });
      summary.deletedPosts.push({
        id: postId,
        campaignSlug: post?.campaignSlug || null,
        status: post?.status || null,
        localOnly: post?.localOnly === true,
        created_at: post?.created_at || null,
        publish_at: post?.publish_at || null,
      });
    }

    summary.deletedCount = summary.deletedPosts.length;
    summary.failedCount = summary.failedRemoteCancellations.length;
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
