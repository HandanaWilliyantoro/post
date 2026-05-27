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
import {
  normalizeMetric,
  toDateTimeInputValue,
} from "@/components/campaignDetails/utils";
import Layout from "@/components/Layout";
import {
  getCampaignAccountsPage,
  listAssignableAccounts,
} from "@/lib/accounts/campaignAccounts";
import { findCampaignBySlug } from "@/lib/campaigns";
import { listPostsPage } from "@/lib/post/queries/listPosts";
import { normalizePostStatusFilter } from "@/lib/post/statusFilters";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";
import {
  getCurrentEasternDateTimeInput,
  getEasternDateTimeInputAfterMinutes,
  normalizeEasternDateInput,
} from "@/lib/utils/easternTime";

function sanitizePage(value) {
  const parsed = Number(value || 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function getRetryMediaUrl(post) {
  const existingMediaUrl = Array.isArray(post?.media)
    ? post.media
        .map((item) => String(item?.url || "").trim())
        .find(Boolean)
    : "";

  return (
    existingMediaUrl ||
    String(
      post?.media_url || post?.failure?.mediaUrl || post?.failure?.media_url || ""
    ).trim()
  );
}

function buildRetryDraftValues(post) {
  const currentPublishAt = getCurrentEasternDateTimeInput();
  const defaultPublishAt = getEasternDateTimeInputAfterMinutes(60);
  const failedPublishAt = toDateTimeInputValue(post?.publish_at);
  const canReuseFailedPublishAt =
    Boolean(failedPublishAt) && failedPublishAt >= currentPublishAt;

  return {
    message: canReuseFailedPublishAt
      ? "This failed post has no reusable media URL. Choose the video again to queue it."
      : "This failed post has no reusable media URL, and its original publish time has already passed. Choose the video again to queue it.",
    values: {
      content: String(post?.content || ""),
      minPublishAt: canReuseFailedPublishAt
        ? currentPublishAt
        : defaultPublishAt,
      publish_at: canReuseFailedPublishAt
        ? failedPublishAt
        : defaultPublishAt,
      video: null,
    },
  };
}

export async function getServerSideProps({ params, query }) {
  const campaign = await findCampaignBySlug(params?.slug);
  if (!campaign) return { notFound: true };

  const metric = normalizeMetric(query?.metric);
  const page = sanitizePage(query?.page);
  const queryText = String(query?.q || "").trim();
  const publishDate = normalizeEasternDateInput(query?.publishDate);
  const statusFilter = normalizePostStatusFilter(query?.status);
  const assignableAccounts =
    metric === "totalAccounts" ? await listAssignableAccounts(campaign.slug) : [];

  if (metric === "totalAccounts") {
    const accountsPage = await getCampaignAccountsPage(campaign.slug, {
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      queryText,
    });

    return {
      props: {
        campaign,
        assignableAccounts,
        metric,
        page: accountsPage.page,
        pageSize: accountsPage.pageSize,
        publishDate,
        statusFilter,
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
    publishDate,
    status: statusFilter,
    queryText,
  });

  const accountsCountPage = await getCampaignAccountsPage(campaign.slug, {
    page: 1,
    pageSize: 1,
  });

  return {
    props: {
      campaign,
      assignableAccounts,
      metric,
      page: postsPage.page,
      pageSize: postsPage.pageSize,
      publishDate,
      statusFilter,
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
  assignableAccounts,
  metric,
  page,
  pageSize,
  publishDate,
  statusFilter,
  queryText,
  rows,
  totalItems,
}) {
  const router = useRouter();
  const [publishDateFilter, setPublishDateFilter] = useState(publishDate);
  const [postStatusFilter, setPostStatusFilter] = useState(statusFilter);
  const [searchText, setSearchText] = useState(queryText);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [removingAccountId, setRemovingAccountId] = useState("");
  const [removingPostId, setRemovingPostId] = useState("");
  const [retryingPostId, setRetryingPostId] = useState("");
  const isAccountsView = metric === "totalAccounts";
  const disableAddPost = !isAccountsView && assignedAccountsCount === 0;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems ? (page - 1) * pageSize + 1 : 0;
  const endItem = totalItems ? Math.min(page * pageSize, totalItems) : 0;

  useFeedbackEffects(formError, formSuccess);

  useEffect(() => {
    setSearchText(queryText);
  }, [queryText]);

  useEffect(() => {
    setPublishDateFilter(publishDate);
  }, [publishDate]);

  useEffect(() => {
    setPostStatusFilter(statusFilter);
  }, [statusFilter]);

  function buildQuery(overrides = {}) {
    const nextQuery = {
      slug: campaign.slug,
      metric,
      ...(publishDateFilter ? { publishDate: publishDateFilter } : {}),
      ...(postStatusFilter ? { status: postStatusFilter } : {}),
      ...(searchText.trim() ? { q: searchText.trim() } : {}),
      ...overrides,
    };

    if (nextQuery.page <= 1) {
      delete nextQuery.page;
    }

    if (!nextQuery.q) {
      delete nextQuery.q;
    }

    if (!nextQuery.publishDate) {
      delete nextQuery.publishDate;
    }

    if (!nextQuery.status) {
      delete nextQuery.status;
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
      const currentPublishDate = String(router.query?.publishDate || "").trim();
      const currentStatus = String(router.query?.status || "").trim();

      if (
        normalized === current &&
        publishDateFilter === currentPublishDate &&
        postStatusFilter === currentStatus
      ) {
        return;
      }

      void navigate({
        q: normalized,
        page: 1,
        publishDate: publishDateFilter,
        status: postStatusFilter,
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [postStatusFilter, publishDateFilter, searchText]);

  const accountFormik = useAccountForm({
    campaignSlug: campaign.slug,
    availableAccounts: assignableAccounts,
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

  function reopenFailedPostAsDraft(post) {
    const draft = buildRetryDraftValues(post);

    setFormSuccess("");
    setFormError(draft.message);
    postFormik.resetForm({ values: draft.values });
    setShowAddModal(true);
  }

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
        body: JSON.stringify({ accountId, campaignSlug: campaign.slug }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to remove account");
      }

      showSuccessSnackbar("Account removed from this campaign.");
      router.reload();
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
      router.reload();
    } catch (error) {
      showErrorSnackbar(error?.message || "Failed to delete post");
    } finally {
      setRemovingPostId("");
    }
  }

  async function handleRetryPost(post) {
    const postId = String(post?.id || "").trim();

    if (!postId) {
      showErrorSnackbar("Post id is required");
      return;
    }

    if (!getRetryMediaUrl(post)) {
      reopenFailedPostAsDraft(post);
      return;
    }

    setRetryingPostId(postId);
    setFormError("");
    setFormSuccess("");

    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to retry post");
      }

      showSuccessSnackbar(payload?.message || "Failed post queued for retry.");
      router.reload();
    } catch (error) {
      const message = error?.message || "Failed to retry post";

      if (
        message.includes("source video") ||
        message.includes("uploaded video")
      ) {
        reopenFailedPostAsDraft(post);
        return;
      }

      showErrorSnackbar(message);
    } finally {
      setRetryingPostId("");
    }
  }

  function openAddModal() {
    setFormError("");
    setFormSuccess("");

    if (isAccountsView) {
      accountFormik.resetForm();
    } else {
      const defaultPublishAt = getEasternDateTimeInputAfterMinutes(60);

      postFormik.resetForm({
        values: {
          content: "",
          minPublishAt: defaultPublishAt,
          publish_at: defaultPublishAt,
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
          publishDate={publishDateFilter}
          queryText={searchText}
          statusFilter={postStatusFilter}
          totalCount={totalItems}
          onPublishDateChange={setPublishDateFilter}
          onQueryChange={setSearchText}
          onStatusFilterChange={setPostStatusFilter}
        />
        <DetailTable
          filteredRows={rows}
          isAccountsView={isAccountsView}
          metric={metric}
          onDeletePost={handleDeletePost}
          onRemoveAccount={handleRemoveAccount}
          onRetryPost={handleRetryPost}
          removingAccountId={removingAccountId}
          removingPostId={removingPostId}
          retryingPostId={retryingPostId}
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
          availableAccounts={assignableAccounts}
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
