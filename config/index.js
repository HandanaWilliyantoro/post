const config = {
  postonce: {
    baseUrl: process.env.POSTONCE_BASE_URL,
    apiKey: process.env.POSTONCE_API_KEY,
  },
  postPublishCallback: {
    url: process.env.POST_PUBLISH_CALLBACK_URL || "",
    bearerToken: process.env.POST_PUBLISH_CALLBACK_BEARER || "",
  },
  postPublishWatcher: {
    pollIntervalMs: Number(
      process.env.POST_PUBLISH_WATCHER_INTERVAL_MS || 15000
    ),
    batchSize: Number(process.env.POST_PUBLISH_WATCHER_BATCH_SIZE || 20),
    runnerSecret: process.env.POST_PUBLISH_WATCHER_SECRET || "",
  },
  mongodb: {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB || "development",
  },
};

export default config;
