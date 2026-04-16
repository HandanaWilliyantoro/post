import { loadProgress } from "@/lib/utils/progressManager";

export const config = {
  api: {
    bodyParser: false,
  },
};

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

  const { campaignSlug } = req.query;

  const interval = setInterval(async () => {
    try {
      const progress = await loadProgress();
      send(progress);

      if (
        progress.status === "completed" ||
        progress.status === "failed" ||
        (campaignSlug && progress.campaignSlug !== campaignSlug)
      ) {
        clearInterval(interval);
        clearInterval(keepAlive);
        res.end();
      }
    } catch (error) {
      send({ status: "failed", error: error.message });
      clearInterval(interval);
      clearInterval(keepAlive);
      res.end();
    }
  }, 2000);

  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(keepAlive);
    res.end();
  });
}
