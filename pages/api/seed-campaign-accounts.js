import { seedCampaignAccounts } from "@/lib/accounts/campaignAccounts";
import { clearAccountsCache } from "@/lib/accounts/getAccounts";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await seedCampaignAccounts();
    clearAccountsCache();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Failed to seed campaign accounts:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Failed to seed campaign accounts",
    });
  }
}
