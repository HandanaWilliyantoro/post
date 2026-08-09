import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import AddAccountModal from "@/components/campaignDetails/AddAccountModal";
import AddPostModal from "@/components/campaignDetails/AddPostModal";
import BulkImagePostGeneratorModal from "@/components/campaignDetails/BulkImagePostGeneratorModal";
import CleanupCampaignButton from "@/components/campaign/CleanupCampaignButton";
import DeleteCampaignButton from "@/components/campaign/DeleteCampaignButton";
import RenameCampaignButton from "@/components/campaign/RenameCampaignButton";
import DetailControls from "@/components/campaignDetails/DetailControls";
import DetailHeader from "@/components/campaignDetails/DetailHeader";
import DetailTable from "@/components/campaignDetails/DetailTable";
import ExportPublishedUrlsButton from "@/components/campaignDetails/ExportPublishedUrlsButton";

import PaginationControls, {
  DEFAULT_PAGE_SIZE,
} from "@/components/PaginationControls";
import PrimaryButton from "@/components/PrimaryButton";
import useAccountForm from "@/components/campaignDetails/useAccountForm";
import useCreatePostForm from "@/components/campaignDetails/useCreatePostForm";
import useFeedbackEffects from "@/components/campaignDetails/useFeedbackEffects";
import {
  normalizeMetric,
  toDateTimeInputValue,
} from "@/components/campaignDetails/utils";
import Layout from "@/components/Layout";
import { syncAccountsFromProvider } from "@/lib/accounts/accountSync";
import {
  getCampaignAccountsPage,
  listAssignableAccounts,
} from "@/lib/accounts/campaignAccounts";
import { findCampaignBySlug } from "@/lib/campaigns";
import { listPostsPage } from "@/lib/post/queries/listPosts";
import { normalizePublishHourFilter } from "@/lib/post/publishHourFilters";
import { normalizePostStatusFilter } from "@/lib/post/statusFilters";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";
import {
  getCurrentEasternDateTimeInput,
  getEasternDateTimeInputAfterMinutes,
  normalizeEasternDateInput,
} from "@/lib/utils/easternTime";
import { replaceRouteIfChanged } from "@/lib/utils/navigation";

function sanitizePage(value) {
  const parsed = Number(value || 1);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function resolveRouteSlug(context = {}) {
  return String(context?.params?.slug || context?.query?.slug || "").trim();
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

async function refreshProviderAccounts() {
  try {
    await syncAccountsFromProvider();
  } catch (error) {
    console.error(
      "[campaign-details] Failed to refresh PostForMe accounts:",
      error?.message || error
    );
  }
}

export async function getServerSideProps(context) {
  const query = context?.query || {};
  const campaign = await findCampaignBySlug(resolveRouteSlug(context));
  if (!campaign) return { notFound: true };

  const metric = normalizeMetric(query?.metric);
  const page = sanitizePage(query?.page);
  const queryText = String(query?.q || "").trim();
  const publishDate = normalizeEasternDateInput(query?.publishDate);
  const publishHour = normalizePublishHourFilter(query?.publishHour);
  const statusFilter = normalizePostStatusFilter(query?.status);
  let assignableAccounts = [];

  if (metric === "totalAccounts") {
    await refreshProviderAccounts();
    assignableAccounts = await listAssignableAccounts(campaign.slug);

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
        publishHour,
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
    publishHour,
    status: statusFilter,
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
      publishHour,
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
  publishHour = null,
  statusFilter,
  queryText,
  rows,
  totalItems,
}) {
  const router = useRouter();
  const [publishDateFilter, setPublishDateFilter] = useState(publishDate);
  const [publishHourFilter, setPublishHourFilter] = useState(
    publishHour === null || publishHour === undefined ? "" : String(publishHour)
  );
  const [postStatusFilter, setPostStatusFilter] = useState(statusFilter);
  const [searchText, setSearchText] = useState(queryText);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkGeneratorModal, setShowBulkGeneratorModal] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [removingAccountId, setRemovingAccountId] = useState("");
  const [removingPostId, setRemovingPostId] = useState("");
  const [retryingPostId, setRetryingPostId] = useState("");
  const isAccountsView = metric === "totalAccounts";
  const disableAddPost = !isAccountsView && assignedAccountsCount === 0;
  const shouldOfferAccountSetup = !isAccountsView && disableAddPost;
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
    setPublishHourFilter(
      publishHour === null || publishHour === undefined ? "" : String(publishHour)
    );
  }, [publishHour]);

  useEffect(() => {
    setPostStatusFilter(statusFilter);
  }, [statusFilter]);

  function buildQuery(overrides = {}) {
    const nextQuery = {
      slug: campaign.slug,
      metric,
      ...(isAccountsView
        ? {
            ...(searchText.trim() ? { q: searchText.trim() } : {}),
          }
        : {
            ...(publishDateFilter ? { publishDate: publishDateFilter } : {}),
            ...(publishHourFilter ? { publishHour: publishHourFilter } : {}),
            ...(postStatusFilter ? { status: postStatusFilter } : {}),
          }),
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

    if (!nextQuery.publishHour) {
      delete nextQuery.publishHour;
    }

    if (!nextQuery.status) {
      delete nextQuery.status;
    }

    return nextQuery;
  }

  function navigate(nextQuery = {}) {
    const query = buildQuery(nextQuery);
    const nextAs = {
      pathname: router.pathname,
      query,
    };

    return replaceRouteIfChanged(router, nextAs, {
      includeSearch: true,
      as: undefined,
      routerOptions: { scroll: false },
    });
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (isAccountsView) {
        const normalized = searchText.trim();
        const current = String(router.query?.q || "").trim();

        if (normalized === current) {
          return;
        }

        void navigate({ q: normalized, page: 1 });
        return;
      }

      const currentPublishDate = String(router.query?.publishDate || "").trim();
      const currentPublishHour = String(router.query?.publishHour || "").trim();
      const currentStatus = String(router.query?.status || "").trim();
      const nextHour = String(publishHourFilter || "").trim();

      if (
        publishDateFilter === currentPublishDate &&
        nextHour === currentPublishHour &&
        postStatusFilter === currentStatus
      ) {
        return;
      }

      void navigate({
        page: 1,
        publishDate: publishDateFilter,
        publishHour: nextHour,
        status: postStatusFilter,
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isAccountsView,
    postStatusFilter,
    publishDateFilter,
    publishHourFilter,
    searchText,
  ]);

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

  useEffect(() => {
    if (!isAccountsView || router.query?.addAccount !== "1" || showAddModal) {
      return;
    }

    setFormError("");
    setFormSuccess("");
    accountFormik.resetForm();
    setShowAddModal(true);

    void replaceRouteIfChanged(
      router,
      {
        pathname: router.pathname,
        query: { slug: campaign.slug, metric: "totalAccounts" },
      },
      {
        routerOptions: { scroll: false, shallow: true },
      }
    );
  }, [accountFormik, campaign.slug, isAccountsView, router, showAddModal]);

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

  function closeBulkGeneratorModal() {
    setShowBulkGeneratorModal(false);
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

    const confirmed = window.confirm(`Delete post "${postId}"?`);

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

    if (shouldOfferAccountSetup) {
      router.push({
        pathname: "/campaign-details/[slug]",
        query: {
          slug: campaign.slug,
          metric: "totalAccounts",
          addAccount: "1",
        },
      });
      return;
    }

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
          addButtonLabel={
            isAccountsView || shouldOfferAccountSetup ? "Add account" : "Add post"
          }
          campaign={campaign}
          disableAddPost={!shouldOfferAccountSetup && disableAddPost}
          extraActions={
            <>
              {!isAccountsView ? (
                <PrimaryButton
                  className="dashboard-button-inline"
                  variant="ghost"
                  onClick={() => setShowBulkGeneratorModal(true)}
                  disabled={disableAddPost}
                >
                  Bulk image posts
                </PrimaryButton>
              ) : null}
              {!isAccountsView ? (
                <ExportPublishedUrlsButton campaignSlug={campaign.slug} />
              ) : null}
              <RenameCampaignButton campaign={campaign} />
              <CleanupCampaignButton campaign={campaign} />
              <DeleteCampaignButton campaign={campaign} />
            </>
          }
          isAccountsView={isAccountsView}
          title={isAccountsView ? `${campaign.label} accounts` : `${campaign.label} posts`}
          onOpenAddModal={openAddModal}
        />
        <DetailControls
          filteredCount={totalItems}
          isAccountsView={isAccountsView}
          publishDate={publishDateFilter}
          publishHour={publishHourFilter}
          queryText={searchText}
          statusFilter={postStatusFilter}
          totalCount={totalItems}
          onPublishDateChange={setPublishDateFilter}
          onPublishHourChange={setPublishHourFilter}
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
          campaignSlug={campaign.slug}
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
      {showBulkGeneratorModal && !isAccountsView ? (
        <BulkImagePostGeneratorModal
          assignedAccountsCount={assignedAccountsCount}
          campaign={campaign}
          disableAddPost={disableAddPost}
          onClose={closeBulkGeneratorModal}
          onQueued={() => router.reload()}
        />
      ) : null}
    </Layout>
  );
}
