import { createCampaignAccount } from "@/lib/accounts/campaignAccounts";
import { clearAccountsCache, getAccounts } from "@/lib/accounts/getAccounts";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const campaignSlug = String(req.query?.campaignSlug || "").trim() || undefined;
      const accounts = await getAccounts({ campaignSlug });

      return res.status(200).json({ success: true, data: accounts });
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
      return res
        .status(500)
        .json({ success: false, error: "Failed to fetch accounts" });
    }
  }

  if (req.method === "POST") {
    try {
      const campaignSlug = String(req.body?.campaignSlug || "").trim();

      if (!campaignSlug) {
        return res
          .status(400)
          .json({ success: false, error: "campaignSlug is required" });
      }

      const account = await createCampaignAccount(campaignSlug, req.body || {});
      clearAccountsCache();

      return res.status(201).json({ success: true, data: account });
    } catch (error) {
      const message = error?.message || "Failed to create account";
      const statusCode =
        message.includes("already exists") || message.includes("required")
          ? 400
          : 500;

      console.error("Failed to create account:", error);
      return res.status(statusCode).json({ success: false, error: message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
