import { MongoClient } from "mongodb";
import config from "@/config";

const { uri } = config.mongodb;

if (!uri) {
  throw new Error("❌ MONGODB_URI is not defined");
}

let client;
let clientPromise;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri);

  global._mongoClientPromise = client.connect().then((client) => {
    console.log("✅ MongoDB connected");
    return client;
  });
}

clientPromise = global._mongoClientPromise;

export default clientPromise;