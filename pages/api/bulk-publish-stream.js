import { bulkPublishPipeline } from "@/lib/pipeline/bulkPublish.pipeline";
import { loadProgress } from "@/lib/utils/progressManager";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // 🔹 REQUIRED headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  // 🔥 IMPORTANT: flush headers immediately
  res.flushHeaders?.();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 🔥 send first event immediately (to confirm connection)
  send({ status: "connected" });

  // 🔹 start pipeline (non-blocking)
  setTimeout(() => {
    bulkPublishPipeline({
      videoDir: "C:\\Users\\USER\\Videos\\Assets\\pollos content bank\\2\\out", // change this
    }).catch(console.error);
  }, 0);

  // 🔹 stream progress
  const interval = setInterval(async () => {
    try {
      const progress = await loadProgress();

      send({
        percentage: progress.percentage || 0,
      });

      if (progress.percentage >= 100) {
        send({ status: "done" });
        clearInterval(interval);
        res.end();
      }
    } catch (err) {
      send({ error: err.message });
    }
  }, 2000);

  // 🔹 keep connection alive (VERY IMPORTANT)
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(keepAlive);
    res.end();
  });
}