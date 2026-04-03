import postonceClient from "@/lib/api/postonceClient";
import kickAccounts from "@/lib/accounts/data/kickAccounts";

export async function getAccounts() {
  const accounts = await postonceClient.get("/accounts");
  const blacklist = new Set(
    kickAccounts.map((u) => u.toLowerCase())
  );

  return accounts.filter((acc) => {
    const username = acc.username?.toLowerCase();

    // ❌ remove if in blacklist
    if (blacklist.has(username)) return false;

    // ❌ remove non-instagram
    if (acc.platform !== "instagram") return false;

    // ❌ remove inactive
    if (acc.status !== "active") return false;

    return true;
  });
}