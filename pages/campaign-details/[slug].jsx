import { useMemo, useState } from "react";
import { useRouter } from "next/router";

import AddAccountModal from "@/components/campaignDetails/AddAccountModal";
import AddPostModal from "@/components/campaignDetails/AddPostModal";
import DeleteCampaignButton from "@/components/campaign/DeleteCampaignButton";
import DetailControls from "@/components/campaignDetails/DetailControls";
import DetailHeader from "@/components/campaignDetails/DetailHeader";
import DetailTable from "@/components/campaignDetails/DetailTable";
import PaginationControls from "@/components/PaginationControls";
import useAccountForm from "@/components/campaignDetails/useAccountForm";
import useCreatePostForm from "@/components/campaignDetails/useCreatePostForm";
import useFeedbackEffects from "@/components/campaignDetails/useFeedbackEffects";
import usePagination from "@/components/usePagination";
import { normalizeMetric } from "@/components/campaignDetails/utils";
import Layout from "@/components/Layout";
import { clearAccountsCache, getAccounts } from "@/lib/accounts/getAccounts";
import { listIdleAccounts } from "@/lib/accounts/campaignAccounts";
import { syncAccountsFromPostOnce } from "@/lib/accounts/accountSync";
import { findCampaignBySlug } from "@/lib/campaigns";
import { listAllPosts } from "@/lib/post";

export async function getServerSideProps({ params, query }) {
  const campaign = await findCampaignBySlug(params?.slug);
  if (!campaign) return { notFound: true };

  const metric = normalizeMetric(query?.metric);
  if (metric === "totalAccounts") {
    await syncAccountsFromPostOnce();
    clearAccountsCache();
  }
  const accounts = await getAccounts({ campaignSlug: campaign.slug });
  const idleAccounts = metric === "totalAccounts" ? await listIdleAccounts() : [];
  if (metric === "totalAccounts") {
    return { props: { campaign, metric, rows: accounts, assignedAccountsCount: accounts.length, idleAccounts } };
  }

  const posts = await listAllPosts({ campaignSlug: campaign.slug });
  return { props: { campaign, metric, rows: posts, assignedAccountsCount: accounts.length, idleAccounts } };
}

export default function CampaignDetailsPage({ campaign, metric, rows, assignedAccountsCount, idleAccounts }) {
  const router = useRouter();
  const [accountRows, setAccountRows] = useState(metric === "totalAccounts" ? rows : []);
  const [postRows, setPostRows] = useState(metric === "totalAccounts" ? [] : rows);
  const [queryText, setQueryText] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const isAccountsView = metric === "totalAccounts";
  const tableRows = isAccountsView ? accountRows : postRows;
  const disableAddPost = !isAccountsView && assignedAccountsCount === 0;

  useFeedbackEffects(formError, formSuccess);
  const filteredRows = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return tableRows.filter((entry) => {
      if (!needle) return true;
      const haystack = isAccountsView ? `${entry?.username || ""} ${entry?.platform || ""} ${entry?.status || ""} ${entry?.id || ""}` : `${entry?.content || ""} ${entry?.status || ""} ${entry?.id || ""} ${entry?.origin || ""}`;
      return haystack.toLowerCase().includes(needle);
    });
  }, [isAccountsView, queryText, tableRows]);
  const pagination = usePagination(filteredRows);

  const accountFormik = useAccountForm({ campaignSlug: campaign.slug, idleAccounts, router, setAccountRows, setFormError, setFormSuccess });
  const postFormik = useCreatePostForm({ campaignSlug: campaign.slug, router, setFormError, setFormSuccess, setPostRows });

  function closeAddModal() {
    setShowAddModal(false);
    setFormError("");
    setFormSuccess("");
    accountFormik.resetForm();
    postFormik.resetForm();
  }

  return (
    <Layout title={campaign.label}>
      <div className="detail-shell">
        <DetailHeader addButtonLabel={isAccountsView ? "Add account" : "Add post"} campaign={campaign} disableAddPost={disableAddPost} extraActions={<DeleteCampaignButton campaign={campaign} />} isAccountsView={isAccountsView} title={isAccountsView ? `${campaign.label} accounts` : `${campaign.label} posts`} onOpenAddModal={() => setShowAddModal(true)} />
        <DetailControls filteredCount={filteredRows.length} isAccountsView={isAccountsView} queryText={queryText} totalCount={tableRows.length} onQueryChange={setQueryText} />
        <DetailTable filteredRows={pagination.paginatedItems} isAccountsView={isAccountsView} metric={metric} />
        <PaginationControls {...pagination} onNext={pagination.setNextPage} onPrevious={pagination.setPreviousPage} />
      </div>

      {showAddModal && isAccountsView ? <AddAccountModal idleAccounts={idleAccounts} formError={formError} formSuccess={formSuccess} formik={accountFormik} onClose={closeAddModal} /> : null}
      {showAddModal && !isAccountsView ? <AddPostModal assignedAccountsCount={assignedAccountsCount} disableAddPost={disableAddPost} formError={formError} formSuccess={formSuccess} formik={postFormik} onClose={closeAddModal} /> : null}
    </Layout>
  );
}
