import fs from "fs/promises";
import path from "path";

const PROFILE_FILES = {
  truerepublicanhub: "instagram-truerepublicanhub.jpg",
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const account = String(req.query?.account || "truerepublicanhub")
    .trim()
    .toLowerCase();
  const fileName = PROFILE_FILES[account] || PROFILE_FILES.truerepublicanhub;
  const filePath = path.join(
    process.cwd(),
    "downloads",
    "swa-profile-pictures",
    fileName
  );

  try {
    const buffer = await fs.readFile(filePath);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(buffer);
  } catch {
    return res.status(404).json({
      success: false,
      error: "Profile image not found",
    });
  }
}
