const config = {
  postforme: {
    baseUrl: process.env.POSTFORME_BASE_URL || "https://api.postforme.dev/v1",
    apiKey: process.env.POSTFORME_API_KEY || "",
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
  xai: {
    apiKey: process.env.XAI_API_KEY || process.env.GROK_API_KEY || "",
    baseUrl: (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(
      /\/+$/,
      ""
    ),
    titleModel:
      process.env.XAI_TITLE_MODEL ||
      process.env.GROK_TITLE_MODEL ||
      "grok-4.3",
  },
  mongodb: {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB || "development",
  },
};

export default config;
