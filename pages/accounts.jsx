import { useMemo, useState } from "react";

import Layout from "@/components/Layout";
import { listManagedAccounts } from "@/lib/accounts/accountInventory";
import { getAllCampaignAccountAssignments } from "@/lib/accounts/campaignAccounts";
import { fetchAllAccounts, serializeAccounts } from "@/lib/accounts/fetchAccounts";
import { getCampaignRoutes } from "@/lib/campaigns";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function buildAccountRows({ accounts, localAccounts, assignments, campaigns }) {
  const campaignLabels = new Map(campaigns.map((campaign) => [campaign.slug, campaign.label]));
  const assignmentMap = new Map(
    assignments.map((assignment) => [assignment.username, assignment.campaignSlug])
  );
  const instagramFilter = (account) =>
    String(account?.platform || "").trim().toLowerCase() === "instagram";
  const remoteByUsername = new Map(
    serializeAccounts(accounts).filter(instagramFilter).map((account) => [
      normalizeUsername(account?.username),
      account,
    ])
  );
  const localByUsername = new Map(
    serializeAccounts(localAccounts).filter(instagramFilter).map((account) => [
      normalizeUsername(account?.username),
      account,
    ])
  );
  const usernames = [...new Set([...remoteByUsername.keys(), ...localByUsername.keys()])];

  return usernames
    .map((username) => {
      const remoteAccount = remoteByUsername.get(username);
      const localAccount = localByUsername.get(username);
      const account = remoteAccount || localAccount || {};
      const assignedCampaignSlug = assignmentMap.get(username) || "";
      const baseStatus = String(remoteAccount?.status || localAccount?.status || "active")
        .trim()
        .toLowerCase();

      return {
        ...account,
        id: remoteAccount?.id || localAccount?.id || username,
        username,
        platform: "instagram",
        niche: String(localAccount?.niche || remoteAccount?.niche || "streaming")
          .trim()
          .toLowerCase() || "streaming",
        accountStatus: assignedCampaignSlug
          ? "active"
          : baseStatus === "inactive"
            ? "inactive"
            : "idle",
        assignedCampaignSlug,
        assignedCampaignLabel: assignedCampaignSlug
          ? campaignLabels.get(assignedCampaignSlug) || assignedCampaignSlug
          : "—",
      };
    })
    .filter((account) => account.accountStatus !== "idle");
}

export async function getServerSideProps() {
  const [accounts, assignments, campaigns, localAccounts] = await Promise.all([
    fetchAllAccounts(),
    getAllCampaignAccountAssignments(),
    getCampaignRoutes(),
    listManagedAccounts(),
  ]);

  return {
    props: {
      rows: buildAccountRows({ accounts, localAccounts, assignments, campaigns }),
    },
  };
}

export default function AccountsPage({ rows }) {
  const [queryText, setQueryText] = useState("");
  const filteredRows = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((account) => {
      const haystack =
        `${account?.username || ""} ${account?.platform || ""} ${account?.niche || ""} ` +
        `${account?.accountStatus || ""} ${account?.assignedCampaignLabel || ""} ${account?.id || ""}`;
      return haystack.toLowerCase().includes(needle);
    });
  }, [queryText, rows]);

  return (
    <Layout title="All Accounts">
      <div className="detail-shell">
        <header className="detail-header">
          <div className="detail-header-left">
            <div className="detail-title-row">
              <h1 className="detail-title">All available accounts</h1>
            </div>
          </div>
        </header>

        <section className="detail-controls">
          <label className="detail-search">
            <span className="sr-only">Search accounts</span>
            <input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              className="detail-search-input"
              placeholder="Search accounts..."
            />
          </label>
          <p className="detail-showing">
            Showing <span className="detail-showing-strong">{filteredRows.length}</span> of{" "}
            <span className="detail-showing-strong">{rows.length}</span>
          </p>
        </section>

        <section className="detail-table-card">
          <table className="detail-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Platform</th>
                <th>Niche</th>
                <th>Status</th>
                <th>Assigned Campaign</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={6} className="detail-empty">
                    Nothing matches your filters yet.
                  </td>
                </tr>
              ) : null}
              {filteredRows.map((account) => (
                <tr key={account.id}>
                  <td className="detail-strong">{account.username || "—"}</td>
                  <td>{account.platform || "—"}</td>
                  <td>{account.niche || "—"}</td>
                  <td>{account.accountStatus || "—"}</td>
                  <td>{account.assignedCampaignLabel || "—"}</td>
                  <td className="detail-mono">{account.id || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Layout>
  );
}
