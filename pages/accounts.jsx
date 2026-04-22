import { useMemo, useState } from "react";

import Layout from "@/components/Layout";
import PaginationControls from "@/components/PaginationControls";
import usePagination from "@/components/usePagination";
import { getAllCampaignAccountAssignments } from "@/lib/accounts/campaignAccounts";
import { syncAccountsFromPostOnce } from "@/lib/accounts/accountSync";
import { getCampaignRoutes } from "@/lib/campaigns";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function buildAccountRows({ localAccounts, assignments, campaigns }) {
  const campaignLabels = new Map(campaigns.map((campaign) => [campaign.slug, campaign.label]));
  const assignmentMap = new Map(
    assignments.map((assignment) => [assignment.username, assignment.campaignSlug])
  );
  const instagramFilter = (account) =>
    String(account?.platform || "").trim().toLowerCase() === "instagram";
  const localByUsername = new Map(
    localAccounts.filter(instagramFilter).map((account) => [
      normalizeUsername(account?.username),
      account,
    ])
  );
  const usernames = [...new Set(localByUsername.keys())];

  return usernames
    .map((username) => {
      const localAccount = localByUsername.get(username);
      const account = localAccount || {};
      const campaignSlug = String(account?.campaignSlug || assignmentMap.get(username) || "").trim();

      return {
        ...account,
        id: localAccount?.id || username,
        username,
        platform: "instagram",
        niche: String(localAccount?.niche || "streaming")
          .trim()
          .toLowerCase() || "streaming",
        accountStatus: campaignSlug ? "active" : "idle",
        campaignSlug,
        assignedCampaignLabel: campaignSlug
          ? campaignLabels.get(campaignSlug) || campaignSlug
          : "—",
      };
    });
}

export async function getServerSideProps() {
  const [assignments, campaigns, localAccounts] = await Promise.all([
    getAllCampaignAccountAssignments(),
    getCampaignRoutes(),
    syncAccountsFromPostOnce(),
  ]);

  return {
    props: {
      rows: buildAccountRows({ localAccounts, assignments, campaigns }),
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
  const pagination = usePagination(filteredRows);

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
              {pagination.paginatedItems.map((account) => (
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

        <PaginationControls {...pagination} onNext={pagination.setNextPage} onPrevious={pagination.setPreviousPage} />
      </div>
    </Layout>
  );
}
