import { ensureBulkPublishQueueRunning } from "@/lib/pipeline/bulkPublishQueue";
import {
  loadLatestProgress,
  loadProgress,
} from "@/lib/utils/progressManager";

export const config = {
  api: {
    bodyParser: false,
  },
};

function isTerminalStatus(status) {
  return ["completed", "cancelled", "failed"].includes(status);
}

export default async function handler(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  res.flushHeaders?.();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const runId = String(req.query?.runId || "").trim();
  const campaignSlug = String(req.query?.campaignSlug || "").trim();

  const readProgress = async () => {
    ensureBulkPublishQueueRunning();

    if (runId) {
      return loadProgress(runId);
    }

    return loadLatestProgress({ campaignSlug });
  };

  const stop = () => {
    clearInterval(interval);
    clearInterval(keepAlive);
    res.end();
  };

  const poll = async () => {
    try {
      const progress = await readProgress();

      if (runId && !progress?.runId) {
        send({ status: "failed", error: "Bulk publish run not found" });
        stop();
        return;
      }

      send(progress);

      if (isTerminalStatus(progress.status)) {
        stop();
      }
    } catch (error) {
      send({ status: "failed", error: error.message });
      stop();
    }
  };

  const interval = setInterval(poll, 2000);
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  void poll();

  req.on("close", () => {
    stop();
  });
}
