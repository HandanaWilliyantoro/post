import {
  createCampaignAccount,
  getCampaignAccounts,
  releaseCampaignAccount,
} from "@/lib/accounts/campaignAccounts";
import { syncAccountsFromProvider } from "@/lib/accounts/accountSync";
import { clearAccountsCache, getAccounts } from "@/lib/accounts/getAccounts";

function buildAccountSyncErrorMessage(error) {
  if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError") {
    return "PostForMe account sync timed out. Try Refresh again in a moment.";
  }

  return error?.message || "Failed to refresh accounts from PostForMe";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const campaignSlug = String(req.query?.campaignSlug || "").trim() || undefined;
      const shouldSync = String(req.query?.sync || "").trim() === "1";

      if (shouldSync) {
        try {
          await syncAccountsFromProvider({ force: true });
          clearAccountsCache();
        } catch (error) {
          console.error("Failed to refresh provider accounts:", error);

          return res.status(200).json({
            success: true,
            warning: buildAccountSyncErrorMessage(error),
            data: campaignSlug ? await getCampaignAccounts(campaignSlug) : [],
          });
        }
      }

      const accounts = campaignSlug
        ? await getAccounts({ campaignSlug })
        : shouldSync
          ? []
          : await syncAccountsFromProvider({ force: true });
      if (!campaignSlug) clearAccountsCache();

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
      const account = await createCampaignAccount(campaignSlug, req.body || {});
      clearAccountsCache();

      return res.status(201).json({ success: true, data: account });
    } catch (error) {
      const message = error?.message || "Failed to create account";
      const statusCode =
        message.includes("already exists") ||
        message.includes("required") ||
        message.includes("not found") ||
        message.includes("already assigned") ||
        message.includes("another campaign")
          ? 400
          : 500;

      console.error("Failed to create account:", error);
      return res.status(statusCode).json({ success: false, error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const account = await releaseCampaignAccount(req.body || req.query || {});
      clearAccountsCache();

      return res.status(200).json({ success: true, data: account });
    } catch (error) {
      const message = error?.message || "Failed to remove account";
      const statusCode =
        message.includes("required") ||
        message.includes("not found") ||
        message.includes("not assigned")
          ? 400
          : 500;

      console.error("Failed to remove account:", error);
      return res.status(statusCode).json({ success: false, error: message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
