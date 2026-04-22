import { getDb } from "@/lib/db";
import { ensurePostsCollection } from "@/lib/post/queries/listPosts";

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function buildPostDuplicateKey({ campaignSlug, content, publish_at }) {
  return [
    String(campaignSlug || "").trim(),
    normalizeText(content).toLowerCase(),
    String(publish_at || "").trim(),
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
