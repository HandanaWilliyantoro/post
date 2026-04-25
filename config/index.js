const config = {
  postonce: {
    baseUrl: process.env.POSTONCE_BASE_URL,
    apiKey: process.env.POSTONCE_API_KEY,
  },
  mongodb: {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB || "postonce",
  },
};

export default config;
