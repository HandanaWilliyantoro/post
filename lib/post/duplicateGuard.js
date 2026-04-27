import { getDb } from "@/lib/db";
import { ensurePostsCollection } from "@/lib/post/queries/listPosts";

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeTargetId(target) {
  if (target && typeof target === "object") {
    return String(target.account_id || target.id || "").trim();
  }

  return String(target || "").trim();
}

function buildTargetSignature(targets) {
  if (!Array.isArray(targets) || !targets.length) {
    return "";
  }

  return targets
    .map(normalizeTargetId)
    .filter(Boolean)
    .sort()
    .join(",");
}

export function buildPostDuplicateKey({
  campaignSlug,
  content,
  publish_at,
  targets = [],
}) {
  return [
    String(campaignSlug || "").trim(),
    normalizeText(content).toLowerCase(),
    String(publish_at || "").trim(),
    buildTargetSignature(targets),
  ].join("|");
}

export async function findDuplicatePost(key) {
  if (!key) return null;
  await ensurePostsCollection();
  const db = await getDb();
  return db.collection("posts").findOne(
    { duplicateKey: key },
    { projection: { _id: 0 } }
  );
}
