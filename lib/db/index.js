import clientPromise from "./mongo";
import config from "@/config";

export async function getDb() {
  const client = await clientPromise;
  return client.db(config.mongodb.dbName);
}