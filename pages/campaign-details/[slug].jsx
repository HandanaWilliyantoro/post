import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import AddAccountModal from "@/components/campaignDetails/AddAccountModal";
import AddPostModal from "@/components/campaignDetails/AddPostModal";
import DeleteCampaignButton from "@/components/campaign/DeleteCampaignButton";
import DetailControls from "@/components/campaignDetails/DetailControls";
import DetailHeader from "@/components/campaignDetails/DetailHeader";
import DetailTable from "@/components/campaignDetails/DetailTable";
import PaginationControls, {
  DEFAULT_PAGE_SIZE,
} from "@/components/PaginationControls";
import useAccountForm from "@/components/campaignDetails/useAccountForm";
import useCreatePostForm from "@/components/campaignDetails/useCreatePostForm";
import useFeedbackEffects from "@/components/campaignDetails/useFeedbackEffects";
import { normalizeMetric } from "@/components/campaignDetails/utils";
import Layout from "@/components/Layout";
import { getCampaignAccountsPage, listIdleAccounts } from "@/lib/accounts/campaignAccounts";
import { findCampaignBySlug } from "@/lib/campaigns";
import { listPostsPage } from "@/lib/post/queries/listPosts";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";
import { getCurrentEasternDateTimeInput } from "@/lib/utils/easternTime";

function sanitizePage(value) {
  const parsed = Number(value || 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export async function getServerSideProps({ params, query }) {
  const campaign = await findCampaignBySlug(params?.slug);
  if (!campaign) return { notFound: true };

  const metric = normalizeMetric(query?.metric);
  const page = sanitizePage(query?.page);
  const queryText = String(query?.q || "").trim();
  const idleAccounts = metric === "totalAccounts" ? await listIdleAccounts() : [];

  if (metric === "totalAccounts") {
    const accountsPage = await getCampaignAccountsPage(campaign.slug, {
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      queryText,
    });

    return {
      props: {
        campaign,
        idleAccounts,
        metric,
        page: accountsPage.page,
        pageSize: accountsPage.pageSize,
        queryText,
        rows: accountsPage.items,
        totalItems: accountsPage.totalItems,
      },
    };
  }

  const postsPage = await listPostsPage({
    campaignSlug: campaign.slug,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    queryText,
  });

  const accountsCountPage = await getCampaignAccountsPage(campaign.slug, {
    page: 1,
    pageSize: 1,
  });

  return {
    props: {
      campaign,
      idleAccounts,
      metric,
      page: postsPage.page,
      pageSize: postsPage.pageSize,
      queryText,
      rows: postsPage.items,
      totalItems: postsPage.totalItems,
      assignedAccountsCount: accountsCountPage.totalItems,
    },
  };
}

export default function CampaignDetailsPage({
  assignedAccountsCount = 0,
  campaign,
  idleAccounts,
  metric,
  page,
  pageSize,
  queryText,
  rows,
  totalItems,
}) {
  const router = useRouter();
  const [searchText, setSearchText] = useState(queryText);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [removingAccountId, setRemovingAccountId] = useState("");
  const [removingPostId, setRemovingPostId] = useState("");
  const isAccountsView = metric === "totalAccounts";
  const disableAddPost = !isAccountsView && assignedAccountsCount === 0;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems ? (page - 1) * pageSize + 1 : 0;
  const endItem = totalItems ? Math.min(page * pageSize, totalItems) : 0;

  useFeedbackEffects(formError, formSuccess);

  useEffect(() => {
    setSearchText(queryText);
  }, [queryText]);

  function buildQuery(overrides = {}) {
    const nextQuery = {
      slug: campaign.slug,
      metric,
      ...(searchText.trim() ? { q: searchText.trim() } : {}),
      ...overrides,
    };

    if (nextQuery.page <= 1) {
      delete nextQuery.page;
    }

    if (!nextQuery.q) {
      delete nextQuery.q;
    }

    return nextQuery;
  }

  function navigate(nextQuery = {}) {
    return router.replace(
      {
        pathname: router.pathname,
        query: buildQuery(nextQuery),
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

      void navigate({ q: normalized, page: 1 });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchText]);

  const accountFormik = useAccountForm({
    campaignSlug: campaign.slug,
    idleAccounts,
    router,
    setAccountRows: () => {},
    setFormError,
    setFormSuccess,
  });
  const postFormik = useCreatePostForm({
    assignedAccountsCount,
    campaignSlug: campaign.slug,
    router,
    setFormError,
    setFormSuccess,
    setPostRows: () => {},
  });

  function closeAddModal() {
    setShowAddModal(false);
    setFormError("");
    setFormSuccess("");
    accountFormik.resetForm();
    postFormik.resetForm();
  }

  async function handleRemoveAccount(account) {
    const accountId = String(account?.id || "").trim();
    const username = String(account?.username || "").trim();

    if (!accountId) {
      showErrorSnackbar("Account id is required");
      return;
    }

    const confirmed = window.confirm(
      `Remove "${username || accountId}" from ${campaign.label}?`
    );

    if (!confirmed) {
      return;
    }

    setRemovingAccountId(accountId);
    setFormError("");
    setFormSuccess("");

    try {
      const response = await fetch("/api/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to remove account");
      }

      showSuccessSnackbar("Account moved back to idle.");
      await router.replace(router.asPath, undefined, { scroll: false });
    } catch (error) {
      showErrorSnackbar(error?.message || "Failed to remove account");
    } finally {
      setRemovingAccountId("");
    }
  }

  async function handleDeletePost(post) {
    const postId = String(post?.id || "").trim();

    if (!postId) {
      showErrorSnackbar("Post id is required");
      return;
    }

    const confirmed = window.confirm(
      `Delete post "${postId}" from PostOnce and local posts?`
    );

    if (!confirmed) {
      return;
    }

    setRemovingPostId(postId);
    setFormError("");
    setFormSuccess("");

    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to delete post");
      }

      showSuccessSnackbar("Post deleted.");
      await router.replace(router.asPath, undefined, { scroll: false });
    } catch (error) {
      showErrorSnackbar(error?.message || "Failed to delete post");
    } finally {
      setRemovingPostId("");
    }
  }

  function openAddModal() {
    setFormError("");
    setFormSuccess("");

    if (isAccountsView) {
      accountFormik.resetForm();
    } else {
      postFormik.resetForm({
        values: {
          content: "",
          titleVariants: "",
          publish_at: getCurrentEasternDateTimeInput(),
          video: null,
        },
      });
    }

    setShowAddModal(true);
  }

  return (
    <Layout title={campaign.label}>
      <div className="detail-shell">
        <DetailHeader
          addButtonLabel={isAccountsView ? "Add account" : "Add post"}
          campaign={campaign}
          disableAddPost={disableAddPost}
          extraActions={<DeleteCampaignButton campaign={campaign} />}
          isAccountsView={isAccountsView}
          title={isAccountsView ? `${campaign.label} accounts` : `${campaign.label} posts`}
          onOpenAddModal={openAddModal}
        />
        <DetailControls
          filteredCount={totalItems}
          isAccountsView={isAccountsView}
          queryText={searchText}
          totalCount={totalItems}
          onQueryChange={setSearchText}
        />
        <DetailTable
          filteredRows={rows}
          isAccountsView={isAccountsView}
          metric={metric}
          onDeletePost={handleDeletePost}
          onRemoveAccount={handleRemoveAccount}
          removingAccountId={removingAccountId}
          removingPostId={removingPostId}
        />
        <PaginationControls
          endItem={endItem}
          onNext={() => void navigate({ page: Math.min(page + 1, pageCount) })}
          onPrevious={() => void navigate({ page: Math.max(page - 1, 1) })}
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          startItem={startItem}
          totalItems={totalItems}
        />
      </div>

      {showAddModal && isAccountsView ? (
        <AddAccountModal
          idleAccounts={idleAccounts}
          formError={formError}
          formSuccess={formSuccess}
          formik={accountFormik}
          onClose={closeAddModal}
        />
      ) : null}
      {showAddModal && !isAccountsView ? (
        <AddPostModal
          assignedAccountsCount={assignedAccountsCount}
          disableAddPost={disableAddPost}
          formError={formError}
          formSuccess={formSuccess}
          formik={postFormik}
          onClose={closeAddModal}
        />
      ) : null}
    </Layout>
  );
}
