import config from "@/config";
import {
  runPostPublishCallbackWatcher,
  startPostPublishCallbackWatcher,
} from "@/lib/post/publishCallbackWatcher";

function isAuthorized(req) {
  const secret = String(config.postPublishWatcher.runnerSecret || "").trim();
  if (!secret) return true;
  const headerSecret = String(req.headers["x-watcher-secret"] || "").trim();
  const querySecret = String(req.query?.secret || "").trim();
  return headerSecret === secret || querySecret === secret;
}

export default async function handler(req, res) {
  startPostPublishCallbackWatcher();
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const rawLimit = Number(req.query?.limit || req.body?.limit || 0);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
    await runPostPublishCallbackWatcher({ limit });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to run publish callbacks",
    });
  }
}
