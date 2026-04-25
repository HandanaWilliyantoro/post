import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import Layout from "@/components/Layout";
import PaginationControls, {
  DEFAULT_PAGE_SIZE,
} from "@/components/PaginationControls";
import PrimaryButton from "@/components/PrimaryButton";
import { listLocalAccountsPage } from "@/lib/accounts/campaignAccounts";
import { getCampaignRoutes } from "@/lib/campaigns";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";

function buildAccountRows({ localAccounts, campaigns }) {
  const campaignLabels = new Map(
    campaigns.map((campaign) => [campaign.slug, campaign.label])
  );

  return localAccounts.map((account) => {
    const campaignSlug = String(account?.campaignSlug || "").trim();

    return {
      ...account,
      id: account?.id || account?.username || "-",
      username: account?.username || "-",
      platform: account?.platform || "instagram",
      niche:
        String(account?.niche || "streaming").trim().toLowerCase() ||
        "streaming",
      accountStatus: account?.status || (campaignSlug ? "active" : "idle"),
      campaignSlug,
      assignedCampaignLabel: campaignSlug
        ? campaignLabels.get(campaignSlug) || campaignSlug
        : "-",
    };
  });
}

function sanitizePage(value) {
  const parsed = Number(value || 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export async function getServerSideProps({ query }) {
  const page = sanitizePage(query?.page);
  const queryText = String(query?.q || "").trim();
  const [campaigns, accountsPage] = await Promise.all([
    getCampaignRoutes(),
    listLocalAccountsPage({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      queryText,
    }),
  ]);

  return {
    props: {
      page: accountsPage.page,
      pageSize: accountsPage.pageSize,
      queryText,
      rows: buildAccountRows({
        localAccounts: accountsPage.items,
        campaigns,
      }),
      totalItems: accountsPage.totalItems,
    },
  };
}

export default function AccountsPage({
  page,
  pageSize,
  queryText,
  rows,
  totalItems,
}) {
  const router = useRouter();
  const [searchText, setSearchText] = useState(queryText);
  const [isSeeding, setIsSeeding] = useState(false);
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems ? (page - 1) * pageSize + 1 : 0;
  const endItem = totalItems ? Math.min(page * pageSize, totalItems) : 0;

  useEffect(() => {
    setSearchText(queryText);
  }, [queryText]);

  function navigate(nextQuery = {}) {
    return router.replace(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { scroll: false }
    );
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = searchText.trim();
      const current = String(router.query?.q || "").trim();

      if (normalized === current) {
        return;
      }

      const nextQuery = {};

      if (normalized) {
        nextQuery.q = normalized;
      }

      void navigate(nextQuery);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchText]);

  async function handleSeedAccounts() {
    setIsSeeding(true);

    try {
      const response = await fetch("/api/accounts", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to seed accounts");
      }

      showSuccessSnackbar("Accounts synced from PostOnce.");
      await navigate(searchText.trim() ? { q: searchText.trim() } : {});
    } catch (error) {
      showErrorSnackbar(error?.message || "Failed to seed accounts");
    } finally {
      setIsSeeding(false);
    }
  }

  return (
    <Layout title="All Accounts">
      <div className="detail-shell">
        <header className="detail-header">
          <div className="detail-header-left">
            <div className="detail-title-row">
              <h1 className="detail-title">All available accounts</h1>
            </div>
          </div>
          <div className="detail-header-right">
            <PrimaryButton
              className="dashboard-button-inline detail-action-button"
              disabled={isSeeding}
              onClick={handleSeedAccounts}
            >
              {isSeeding ? "Seeding..." : "Seed accounts"}
            </PrimaryButton>
          </div>
        </header>

        <section className="detail-controls">
          <label className="detail-search">
            <span className="sr-only">Search accounts</span>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="detail-search-input"
              placeholder="Search accounts..."
            />
          </label>
          <p className="detail-showing">
            Showing{" "}
            <span className="detail-showing-strong">
              {endItem ? `${startItem}-${endItem}` : 0}
            </span>{" "}
            of <span className="detail-showing-strong">{totalItems}</span>
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
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="detail-empty">
                    Nothing matches your filters yet.
                  </td>
                </tr>
              ) : null}
              {rows.map((account) => (
                <tr key={account.id}>
                  <td className="detail-strong">{account.username || "-"}</td>
                  <td>{account.platform || "-"}</td>
                  <td>{account.niche || "-"}</td>
                  <td>{account.accountStatus || "-"}</td>
                  <td>{account.assignedCampaignLabel || "-"}</td>
                  <td className="detail-mono">{account.id || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <PaginationControls
          endItem={endItem}
          onNext={() =>
            void navigate({
              ...(searchText.trim() ? { q: searchText.trim() } : {}),
              page: Math.min(page + 1, pageCount),
            })
          }
          onPrevious={() =>
            void navigate({
              ...(searchText.trim() ? { q: searchText.trim() } : {}),
              ...(page > 2 ? { page: page - 1 } : {}),
            })
          }
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          startItem={startItem}
          totalItems={totalItems}
        />
      </div>
    </Layout>
  );
}
