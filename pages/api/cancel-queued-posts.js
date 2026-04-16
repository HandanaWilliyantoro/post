import { cancelAllQueuedPosts } from "@/lib/post";

const METHOD_NOT_ALLOWED_STATUS = 405;
const INTERNAL_SERVER_ERROR_STATUS = 500;

function getErrorDetails(error) {
  return error?.response?.data || error?.message || "Unknown error";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(METHOD_NOT_ALLOWED_STATUS).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    console.log("[cancel-queued-posts] started");
    const result = await cancelAllQueuedPosts();

    console.log("[cancel-queued-posts] finished", result);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const details = getErrorDetails(error);

    console.error("[cancel-queued-posts] error:", details);

    return res.status(INTERNAL_SERVER_ERROR_STATUS).json({
      success: false,
      error: "Failed to cancel queued posts",
      details,
    });
  }
}
