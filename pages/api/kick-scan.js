import { scanKickCampaignPosts } from "@/lib/instagram/scanKickCampaignPosts";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const result = await scanKickCampaignPosts();
    const wantsCsv =
      String(req.query?.format || "").trim().toLowerCase() === "csv";

    if (wantsCsv) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="kick-campaign-scan-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`
      );

      return res.status(200).send(result.csv || "");
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to scan kick campaign accounts",
    });
  }
}
