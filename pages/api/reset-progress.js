import { clearAllProgress } from "@/lib/utils/progressManager";

export default async function handler(req, res) {
  try {
    await clearAllProgress();
    res.json({ message: "Progress reset" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
