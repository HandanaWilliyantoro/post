import { getDb } from "@/lib/db";

export default async function handler(req, res) {
  try {
    const db = await getDb();

    await db.collection("progress").deleteMany({});

    res.json({ message: "✅ Progress collection cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}