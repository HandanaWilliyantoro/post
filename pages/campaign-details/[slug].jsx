import { useMemo, useState } from "react";
import { useRouter } from "next/router";

import AddAccountModal from "@/components/campaignDetails/AddAccountModal";
import AddPostModal from "@/components/campaignDetails/AddPostModal";
import DeleteCampaignButton from "@/components/campaign/DeleteCampaignButton";
import DetailControls from "@/components/campaignDetails/DetailControls";
import DetailHeader from "@/components/campaignDetails/DetailHeader";
import DetailTable from "@/components/campaignDetails/DetailTable";
import EditPostModal from "@/components/campaignDetails/EditPostModal";
import useAccountForm from "@/components/campaignDetails/useAccountForm";
import useCreatePostForm from "@/components/campaignDetails/useCreatePostForm";
import useEditPostForm from "@/components/campaignDetails/useEditPostForm";
import useFeedbackEffects from "@/components/campaignDetails/useFeedbackEffects";
import useQueuedPosts from "@/components/campaignDetails/useQueuedPosts";
import { isQueuedLike, normalizeMetric } from "@/components/campaignDetails/utils";
import Layout from "@/components/Layout";
import { getAccounts } from "@/lib/accounts/getAccounts";
import { findCampaignBySlug } from "@/lib/campaigns";
import { listAllPosts } from "@/lib/post";

export async function getServerSideProps({ params, query }) {
  const campaign = await findCampaignBySlug(params?.slug);
  if (!campaign) return { notFound: true };

  const metric = normalizeMetric(query?.metric);
  const accounts = await getAccounts({ campaignSlug: campaign.slug });
  if (metric === "totalAccounts") {
    return { props: { campaign, metric, rows: accounts, assignedAccountsCount: accounts.length } };
  }

  const posts = await listAllPosts({ campaignSlug: campaign.slug });
  return { props: { campaign, metric, rows: metric === "queuedPosts" ? posts.filter((post) => isQueuedLike(post?.status)) : posts, assignedAccountsCount: accounts.length } };
}

export default function CampaignDetailsPage({ campaign, metric, rows, assignedAccountsCount }) {
  const router = useRouter();
  const [accountRows, setAccountRows] = useState(metric === "totalAccounts" ? rows : []);
  const [postRows, setPostRows] = useState(metric === "totalAccounts" ? [] : rows);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState(metric === "queuedPosts" ? "queuedLike" : "all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [postDetailsById, setPostDetailsById] = useState({});
  const [publishDrafts, setPublishDrafts] = useState({});
  const [inlineSavingId, setInlineSavingId] = useState("");
  const [deletingPostId, setDeletingPostId] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const isAccountsView = metric === "totalAccounts";
  const tableRows = isAccountsView ? accountRows : postRows;
  const disableAddPost = !isAccountsView && assignedAccountsCount === 0;

  useFeedbackEffects(formError, formSuccess);
  const filteredRows = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return tableRows.filter((entry) => {
      const normalizedStatus = String(entry?.status || "").trim().toLowerCase();
      if (!isAccountsView && statusFilter === "queuedLike" && !isQueuedLike(entry?.status)) return false;
      if (!isAccountsView && !["queuedLike", "all"].includes(statusFilter) && normalizedStatus !== statusFilter) return false;
      if (!needle) return true;
      const haystack = isAccountsView ? `${entry?.username || ""} ${entry?.platform || ""} ${entry?.status || ""} ${entry?.id || ""}` : `${entry?.content || ""} ${entry?.status || ""} ${entry?.id || ""} ${entry?.origin || ""}`;
      return haystack.toLowerCase().includes(needle);
    });
  }, [isAccountsView, queryText, statusFilter, tableRows]);

  const { deleteQueuedPost, openPostEditor, saveInlinePublishAt } = useQueuedPosts({ editingPost, metric, postRows, publishDrafts, setDeletingPostId, setEditingPost, setFormError, setFormSuccess, setInlineSavingId, setPostDetailsById, setPostRows, setPublishDrafts });
  const accountFormik = useAccountForm({ campaignSlug: campaign.slug, router, setAccountRows, setFormError, setFormSuccess });
  const postFormik = useCreatePostForm({ campaignSlug: campaign.slug, router, setFormError, setFormSuccess, setPostRows });
  const editPostFormik = useEditPostForm({ editingPost, setEditingPost, setFormError, setFormSuccess, setPostDetailsById, setPostRows, setPublishDrafts });

  function closeAddModal() {
    setShowAddModal(false);
    setFormError("");
    setFormSuccess("");
    accountFormik.resetForm();
    postFormik.resetForm();
  }

  function closeEditModal() {
    setEditingPost(null);
    editPostFormik.resetForm();
  }

  return (
    <Layout title={campaign.label}>
      <div className="detail-shell">
        <DetailHeader addButtonLabel={isAccountsView ? "Add account" : "Add post"} campaign={campaign} disableAddPost={disableAddPost} extraActions={<DeleteCampaignButton campaign={campaign} />} isAccountsView={isAccountsView} title={isAccountsView ? `${campaign.label} accounts` : `${campaign.label} posts`} onOpenAddModal={() => setShowAddModal(true)} />
        <DetailControls filteredCount={filteredRows.length} isAccountsView={isAccountsView} queryText={queryText} statusFilter={statusFilter} totalCount={tableRows.length} onQueryChange={setQueryText} onStatusFilterChange={setStatusFilter} />
        <DetailTable filteredRows={filteredRows} inlineSavingId={inlineSavingId} isAccountsView={isAccountsView} metric={metric} publishDrafts={publishDrafts} deletingPostId={deletingPostId} onDeleteQueuedPost={deleteQueuedPost} onOpenPostEditor={openPostEditor} onPublishDraftChange={(postId, value) => setPublishDrafts((current) => ({ ...current, [postId]: value }))} onSaveInlinePublishAt={saveInlinePublishAt} />
      </div>

      {showAddModal && isAccountsView ? <AddAccountModal formError={formError} formSuccess={formSuccess} formik={accountFormik} onClose={closeAddModal} /> : null}
      {showAddModal && !isAccountsView ? <AddPostModal assignedAccountsCount={assignedAccountsCount} disableAddPost={disableAddPost} formError={formError} formSuccess={formSuccess} formik={postFormik} onClose={closeAddModal} /> : null}
      {editingPost ? <EditPostModal editingPost={editingPost} formError={formError} formSuccess={formSuccess} formik={editPostFormik} onClose={closeEditModal} /> : null}
    </Layout>
  );
}
