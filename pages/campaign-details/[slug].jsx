import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormik } from "formik";
import { useRouter } from "next/router";
import * as Yup from "yup";

import Layout from "@/components/Layout";
import PrimaryButton from "@/components/PrimaryButton";
import { findCampaignBySlug } from "@/lib/campaigns";
import { getAccounts } from "@/lib/accounts/getAccounts";
import { listAllPosts } from "@/lib/post";
import { isoToEasternDateTimeInput } from "@/lib/utils/easternTime";

function normalizeMetric(metric) {
  if (metric === "totalAccounts") return "totalAccounts";
  if (metric === "queuedPosts") return "queuedPosts";
  if (metric === "totalPosts") return "totalPosts";
  return "totalPosts";
}

function isQueuedLike(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  return normalized === "queued" || normalized === "scheduled";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateTimeInputValue(value) {
  return isoToEasternDateTimeInput(value);
}

function shorten(text, max = 72) {
  const value = String(text || "").trim();
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function getPostPreviewSrc(post) {
  return post?.media?.[0]?.url || "";
}

function summarizeTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return "No targets";
  }

  return targets
    .map((target) => {
      const username = String(target?.username || "").trim();
      const platform = String(target?.platform || "").trim();
      const status = String(target?.status || "").trim();
      return [username || target?.account_id || "unknown", platform, status]
        .filter(Boolean)
        .join(" • ");
    })
    .join(", ");
}

function StatusPill({ value }) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  const className = `detail-pill detail-pill-${normalized || "unknown"}`;

  return <span className={className}>{normalized || "unknown"}</span>;
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="detail-modal-overlay" role="dialog" aria-modal="true">
      <div className="detail-modal">
        <div className="detail-modal-header">
          <h3 className="detail-modal-title">{title}</h3>
          <button
            type="button"
            className="detail-icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="detail-modal-body">{children}</div>
      </div>
    </div>
  );
}

const ACCOUNT_FORM_DEFAULTS = {
  username: "",
  platform: "instagram",
  status: "active",
  avatar_url: "",
  id: "",
};

const POST_FORM_DEFAULTS = {
  content: "",
  publish_at: "",
  video: null,
};

export async function getServerSideProps({ params, query }) {
  const campaign = findCampaignBySlug(params?.slug);

  if (!campaign) {
    return { notFound: true };
  }

  const metric = normalizeMetric(query?.metric);
  const accounts = await getAccounts({ campaignSlug: campaign.slug });

  if (metric === "totalAccounts") {
    return {
      props: {
        campaign,
        metric,
        rows: accounts,
        assignedAccountsCount: accounts.length,
      },
    };
  }

  const posts = await listAllPosts({ campaignSlug: campaign.slug });
  const rows =
    metric === "queuedPosts"
      ? posts.filter((post) => isQueuedLike(post?.status))
      : posts;

  return {
    props: {
      campaign,
      metric,
      rows,
      assignedAccountsCount: accounts.length,
    },
  };
}

export default function CampaignDetailsPage({
  campaign,
  metric,
  rows,
  assignedAccountsCount,
}) {
  const router = useRouter();
  const [accountRows, setAccountRows] = useState(
    metric === "totalAccounts" ? rows : []
  );
  const [postRows, setPostRows] = useState(
    metric === "totalAccounts" ? [] : rows
  );
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    metric === "queuedPosts" ? "queuedLike" : "all"
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [postDetailsById, setPostDetailsById] = useState({});
  const [publishDrafts, setPublishDrafts] = useState({});
  const [inlineSavingId, setInlineSavingId] = useState("");
  const [deletingPostId, setDeletingPostId] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const isAccountsView = metric === "totalAccounts";
  const title = isAccountsView
    ? `${campaign.label} accounts`
    : `${campaign.label} posts`;
  const tableRows = isAccountsView ? accountRows : postRows;
  const disableAddPost = !isAccountsView && assignedAccountsCount === 0;

  const filteredRows = useMemo(() => {
    const needle = queryText.trim().toLowerCase();

    if (isAccountsView) {
      return tableRows.filter((account) => {
        if (!needle) return true;
        const haystack = `${account?.username || ""} ${account?.platform || ""} ${
          account?.status || ""
        } ${account?.id || ""}`.toLowerCase();
        return haystack.includes(needle);
      });
    }

    return tableRows.filter((post) => {
      if (statusFilter === "queuedLike" && !isQueuedLike(post?.status)) {
        return false;
      }

      if (statusFilter !== "queuedLike" && statusFilter !== "all") {
        const normalized = String(post?.status || "")
          .trim()
          .toLowerCase();
        if (normalized !== statusFilter) return false;
      }

      if (!needle) return true;
      const haystack = `${post?.content || ""} ${post?.status || ""} ${
        post?.id || ""
      } ${post?.origin || ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [isAccountsView, queryText, statusFilter, tableRows]);

  const addButtonLabel = isAccountsView ? "Add account" : "Add post";

  useEffect(() => {
    if (metric !== "queuedPosts") {
      return;
    }

    let cancelled = false;

    async function loadQueuedDetails() {
      try {
        const entries = await Promise.all(
          postRows.map(async (post) => {
            try {
              const response = await fetch(`/api/posts/${post.id}`);
              const payload = await response.json();

              if (!response.ok || !payload?.success) {
                return [post.id, post];
              }

              return [post.id, payload.data];
            } catch {
              return [post.id, post];
            }
          })
        );

        if (cancelled) {
          return;
        }

        const nextDetails = Object.fromEntries(entries);
        setPostDetailsById(nextDetails);
        setPublishDrafts((current) => ({
          ...current,
          ...Object.fromEntries(
            entries.map(([id, detail]) => [id, toDateTimeInputValue(detail?.publish_at)])
          ),
        }));
        setPostRows((current) =>
          current.map((post) => nextDetails[post.id] || post)
        );
      } catch {
        // keep local fallback rows
      }
    }

    void loadQueuedDetails();

    return () => {
      cancelled = true;
    };
  }, [metric, postRows.length]);

  function closeModal() {
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

  async function openPostEditor(post) {
    setFormError("");
    setFormSuccess("");

    try {
      const response = await fetch(`/api/posts/${post.id}`);
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to load post details");
      }

      setPostDetailsById((current) => ({
        ...current,
        [post.id]: payload.data,
      }));
      setEditingPost(payload.data);
    } catch (error) {
      setFormError(error.message || "Failed to load post details");
    }
  }

  async function saveInlinePublishAt(postId) {
    const nextPublishAt = String(publishDrafts[postId] || "").trim();

    if (!nextPublishAt) {
      setFormError("Publish time is required");
      return;
    }

    setInlineSavingId(postId);
    setFormError("");
    setFormSuccess("");

    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publish_at: nextPublishAt,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to update publish time");
      }

      setPostRows((current) =>
        current.map((post) => (post.id === postId ? payload.data : post))
      );
      setPostDetailsById((current) => ({
        ...current,
        [postId]: payload.data,
      }));
      setPublishDrafts((current) => ({
        ...current,
        [postId]: toDateTimeInputValue(payload.data?.publish_at),
      }));
      setFormSuccess("Publish time updated.");
    } catch (error) {
      setFormError(error.message || "Failed to update publish time");
    } finally {
      setInlineSavingId("");
    }
  }

  async function deleteQueuedPost(postId) {
    setDeletingPostId(postId);
    setFormError("");
    setFormSuccess("");

    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to delete post");
      }

      setPostRows((current) => current.filter((post) => post.id !== postId));
      setPostDetailsById((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
      setPublishDrafts((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
      if (editingPost?.id === postId) {
        closeEditModal();
      }
      setFormSuccess("Queued post deleted.");
    } catch (error) {
      setFormError(error.message || "Failed to delete post");
    } finally {
      setDeletingPostId("");
    }
  }
  const accountFormik = useFormik({
    initialValues: ACCOUNT_FORM_DEFAULTS,
    validationSchema: Yup.object({
      username: Yup.string().trim().required("Username is required"),
      platform: Yup.string().required("Platform is required"),
      status: Yup.string().required("Status is required"),
      avatar_url: Yup.string().url("Avatar URL must be a valid URL").nullable(),
      id: Yup.string(),
    }),
    onSubmit: async (values, helpers) => {
      setFormError("");
      setFormSuccess("");

      try {
        const response = await fetch("/api/accounts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...values,
            campaignSlug: campaign.slug,
          }),
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to create account");
        }

        setAccountRows((current) => {
          const nextRows = [...current, payload.data];
          nextRows.sort((left, right) =>
            String(left?.username || "").localeCompare(String(right?.username || ""))
          );
          return nextRows;
        });
        setFormSuccess("Account created.");
        helpers.resetForm();
        router.replace(router.asPath, undefined, { scroll: false });
      } catch (error) {
        setFormError(error.message || "Failed to create account");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const postFormik = useFormik({
    initialValues: POST_FORM_DEFAULTS,
    validationSchema: Yup.object({
      content: Yup.string().trim().required("Content is required"),
      publish_at: Yup.string().required("Publish time is required"),
      video: Yup.mixed().required("Video is required"),
    }),
    onSubmit: async (values, helpers) => {
      setFormError("");
      setFormSuccess("");

      try {
        const formData = new FormData();
        formData.append("campaignSlug", campaign.slug);
        formData.append("content", values.content);
        formData.append("publish_at", values.publish_at);

        if (values.video) {
          formData.append("video", values.video);
        }

        const response = await fetch("/api/posts", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to create post");
        }

        setPostRows((current) => [payload.data, ...current]);
        setFormSuccess(
          `Post created and targeted ${payload?.meta?.targetCount || 0} account${
            payload?.meta?.targetCount === 1 ? "" : "s"
          }.`
        );
        helpers.resetForm();
        router.replace(router.asPath, undefined, { scroll: false });
      } catch (error) {
        setFormError(error.message || "Failed to create post");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const editPostFormik = useFormik({
    enableReinitialize: true,
    initialValues: {
      content: editingPost?.content || "",
      publish_at: isoToEasternDateTimeInput(editingPost?.publish_at),
      video: null,
    },
    validationSchema: Yup.object({
      content: Yup.string().trim().required("Content is required"),
      publish_at: Yup.string().required("Publish time is required"),
      video: Yup.mixed().nullable(),
    }),
    onSubmit: async (values, helpers) => {
      if (!editingPost?.id) {
        helpers.setSubmitting(false);
        return;
      }

      setFormError("");
      setFormSuccess("");

      try {
        const formData = new FormData();
        formData.append("content", values.content);
        formData.append("publish_at", values.publish_at);
        if (values.video) {
          formData.append("video", values.video);
        }

        const response = await fetch(`/api/posts/${editingPost.id}`, {
          method: "PATCH",
          body: formData,
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to update post");
        }

        const previousPostId = payload.replacedPostId || editingPost.id;

        setPostRows((current) =>
          current.map((post) => (post.id === previousPostId ? payload.data : post))
        );
        setPostDetailsById((current) => {
          const next = { ...current };
          delete next[previousPostId];
          next[payload.data.id] = payload.data;
          return next;
        });
        setPublishDrafts((current) => {
          const next = { ...current };
          delete next[previousPostId];
          next[payload.data.id] = toDateTimeInputValue(payload.data?.publish_at);
          return next;
        });
        setEditingPost(payload.data);
        setFormSuccess("Queued post updated.");
      } catch (error) {
        setFormError(error.message || "Failed to update post");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  return (
    <Layout title={campaign.label}>
      <div className="detail-shell">
        <header className="detail-header">
          <div className="detail-header-left">
            <Link href={campaign.href} className="detail-back-link">
              <span aria-hidden="true">&larr;</span> Back to overview
            </Link>
            <div className="detail-title-row">
              <h1 className="detail-title">{title}</h1>
            </div>
          </div>

          <div className="detail-header-right">
            {!isAccountsView && disableAddPost ? (
              <p className="detail-inline-note">
                No assigned accounts for this campaign.
              </p>
            ) : null}

            <PrimaryButton
              className="dashboard-button-inline detail-action-button"
              onClick={() => setShowAddModal(true)}
              disabled={disableAddPost}
            >
              {addButtonLabel}
            </PrimaryButton>
          </div>
        </header>

        <section className="detail-controls">
          <label className="detail-search">
            <span className="sr-only">Search</span>
            <input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              className="detail-search-input"
              placeholder={isAccountsView ? "Search accounts…" : "Search posts…"}
            />
          </label>

          <p className="detail-showing">
            Showing <span className="detail-showing-strong">{filteredRows.length}</span>{" "}
            of <span className="detail-showing-strong">{tableRows.length}</span>
          </p>

          {!isAccountsView ? (
            <label className="detail-filter">
              <span className="detail-filter-label">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="detail-filter-select"
              >
                <option value="all">All</option>
                <option value="queuedLike">Queued + scheduled</option>
                <option value="queued">Queued</option>
                <option value="scheduled">Scheduled</option>
                <option value="processing">Processing</option>
                <option value="partial">Partial</option>
                <option value="published">Published</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          ) : null}
        </section>

        <section className="detail-table-card">
          <table className="detail-table">
            <thead>
              {isAccountsView ? (
                <tr>
                  <th>Username</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>ID</th>
                </tr>
              ) : (
                <tr>
                  <th>Content</th>
                  <th>Status</th>
                  <th>Targets</th>
                  <th>Publish at</th>
                  <th>Created</th>
                  <th>ID</th>
                  {metric === "queuedPosts" ? <th>Actions</th> : null}
                </tr>
              )}
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAccountsView ? 4 : metric === "queuedPosts" ? 7 : 6}
                    className="detail-empty"
                  >
                    Nothing matches your filters yet.
                  </td>
                </tr>
              ) : null}

              {isAccountsView
                ? filteredRows.map((account) => (
                    <tr key={account.id}>
                      <td className="detail-strong">{account.username || "—"}</td>
                      <td>{account.platform || "—"}</td>
                      <td>
                        <StatusPill value={account.status} />
                      </td>
                      <td className="detail-mono">{account.id}</td>
                    </tr>
                  ))
                : filteredRows.map((post) => (
                    <tr key={post.id}>
                      <td>
                        <div className="detail-post-main">
                          <span className="detail-strong">{shorten(post.content)}</span>
                          <span className="detail-post-subtle">
                            External ID: {post?.external_id || "—"}
                          </span>
                          <span className="detail-post-subtle">
                            Origin: {post?.origin || "—"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="detail-post-main">
                          <StatusPill value={post.status} />
                          <span className="detail-post-subtle">
                            Media: {post?.media?.[0]?.type || "video"}
                          </span>
                        </div>
                      </td>
                      <td className="detail-targets-cell">
                        {Array.isArray(post?.targets) && post.targets.length ? (
                          post.targets.map((target, index) => (
                            <div key={`${post.id}-target-${index}`} className="detail-target-pill">
                              <span>{target?.username || target?.account_id || "unknown"}</span>
                              <span>{target?.platform || "—"}</span>
                              <span>{target?.status || "pending"}</span>
                            </div>
                          ))
                        ) : (
                          <span className="detail-post-subtle">No targets</span>
                        )}
                      </td>
                      <td>
                        {metric === "queuedPosts" ? (
                          <div className="detail-inline-date-editor">
                            <input
                              className="detail-inline-date-input"
                              type="datetime-local"
                              value={publishDrafts[post.id] || toDateTimeInputValue(post.publish_at)}
                              onChange={(event) =>
                                setPublishDrafts((current) => ({
                                  ...current,
                                  [post.id]: event.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="detail-inline-save-button"
                              onClick={() => saveInlinePublishAt(post.id)}
                              disabled={inlineSavingId === post.id}
                              aria-label="Save publish time"
                            >
                              {inlineSavingId === post.id ? "..." : "Save"}
                            </button>
                          </div>
                        ) : (
                          formatDate(post.publish_at)
                        )}
                      </td>
                      <td>{formatDate(post.created_at)}</td>
                      <td className="detail-mono">{post.id}</td>
                      {metric === "queuedPosts" ? (
                        <td>
                          <div className="detail-row-actions">
                            <button
                              type="button"
                              className="detail-row-icon-button"
                              onClick={() => openPostEditor(post)}
                              aria-label="Edit queued post"
                              title="Edit queued post"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="detail-row-icon-button detail-row-icon-button-danger"
                              onClick={() => deleteQueuedPost(post.id)}
                              disabled={deletingPostId === post.id}
                              aria-label="Delete queued post"
                              title="Delete queued post"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
            </tbody>
          </table>
        </section>
      </div>

      {showAddModal ? (
        <ModalShell title={addButtonLabel} onClose={closeModal}>
          {isAccountsView ? (
            <form
              className="detail-account-form"
              onSubmit={accountFormik.handleSubmit}
            >
              <div className="detail-form-grid">
                <label className="detail-form-field">
                  <span className="detail-form-label">Username</span>
                  <input
                    className="detail-form-input"
                    name="username"
                    value={accountFormik.values.username}
                    onChange={accountFormik.handleChange}
                    onBlur={accountFormik.handleBlur}
                    placeholder="newaccountname"
                    required
                  />
                </label>

                <label className="detail-form-field">
                  <span className="detail-form-label">Platform</span>
                  <select
                    className="detail-form-input"
                    name="platform"
                    value={accountFormik.values.platform}
                    onChange={accountFormik.handleChange}
                    onBlur={accountFormik.handleBlur}
                  >
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube">YouTube</option>
                    <option value="x">X</option>
                  </select>
                </label>

                <label className="detail-form-field">
                  <span className="detail-form-label">Status</span>
                  <select
                    className="detail-form-input"
                    name="status"
                    value={accountFormik.values.status}
                    onChange={accountFormik.handleChange}
                    onBlur={accountFormik.handleBlur}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="paused">Paused</option>
                  </select>
                </label>

                <label className="detail-form-field">
                  <span className="detail-form-label">Custom ID</span>
                  <input
                    className="detail-form-input"
                    name="id"
                    value={accountFormik.values.id}
                    onChange={accountFormik.handleChange}
                    onBlur={accountFormik.handleBlur}
                    placeholder="Optional UUID override"
                  />
                </label>

                <label className="detail-form-field detail-form-field-wide">
                  <span className="detail-form-label">Avatar URL</span>
                  <input
                    className="detail-form-input"
                    name="avatar_url"
                    type="url"
                    value={accountFormik.values.avatar_url}
                    onChange={accountFormik.handleChange}
                    onBlur={accountFormik.handleBlur}
                    placeholder="https://..."
                  />
                </label>
              </div>

              {accountFormik.touched.username && accountFormik.errors.username ? (
                <p className="detail-form-message detail-form-message-error">
                  {accountFormik.errors.username}
                </p>
              ) : null}

              {accountFormik.touched.avatar_url && accountFormik.errors.avatar_url ? (
                <p className="detail-form-message detail-form-message-error">
                  {accountFormik.errors.avatar_url}
                </p>
              ) : null}

              {formError ? (
                <p className="detail-form-message detail-form-message-error">
                  {formError}
                </p>
              ) : null}

              {formSuccess ? (
                <p className="detail-form-message detail-form-message-success">
                  {formSuccess}
                </p>
              ) : null}

              <div className="detail-modal-actions">
                <PrimaryButton
                  className="dashboard-button-inline"
                  variant="ghost"
                  onClick={closeModal}
                  type="button"
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton
                  className="dashboard-button-inline detail-action-button"
                  type="submit"
                  disabled={accountFormik.isSubmitting}
                >
                  {accountFormik.isSubmitting ? "Creating..." : "Create account"}
                </PrimaryButton>
              </div>
            </form>
          ) : (
            <form
              className="detail-account-form"
              onSubmit={postFormik.handleSubmit}
            >
              <div className="detail-form-grid">
                <label className="detail-form-field detail-form-field-wide">
                  <span className="detail-form-label">Content</span>
                  <textarea
                    className="detail-form-input detail-form-textarea"
                    name="content"
                    value={postFormik.values.content}
                    onChange={postFormik.handleChange}
                    onBlur={postFormik.handleBlur}
                    placeholder="Write the caption or post copy"
                    rows={4}
                    required
                  />
                </label>

                <label className="detail-form-field">
                  <span className="detail-form-label">Publish at</span>
                  <input
                    className="detail-form-input"
                    name="publish_at"
                    type="datetime-local"
                    value={postFormik.values.publish_at}
                    onChange={postFormik.handleChange}
                    onBlur={postFormik.handleBlur}
                    required
                  />
                </label>

                <label className="detail-form-field">
                  <span className="detail-form-label">Assigned accounts</span>
                  <div className="detail-form-static">
                    {assignedAccountsCount} target{assignedAccountsCount === 1 ? "" : "s"}
                  </div>
                </label>

                <label className="detail-form-field detail-form-field-wide">
                  <span className="detail-form-label">Video</span>
                  <input
                    className="detail-form-input"
                    name="video"
                    type="file"
                    accept="video/*"
                    onChange={(event) => {
                      postFormik.setFieldValue(
                        "video",
                        event.currentTarget.files?.[0] || null
                      );
                    }}
                    onBlur={() => postFormik.setFieldTouched("video", true)}
                    required
                  />
                </label>
              </div>

              {postFormik.touched.content && postFormik.errors.content ? (
                <p className="detail-form-message detail-form-message-error">
                  {postFormik.errors.content}
                </p>
              ) : null}

              {postFormik.touched.publish_at && postFormik.errors.publish_at ? (
                <p className="detail-form-message detail-form-message-error">
                  {postFormik.errors.publish_at}
                </p>
              ) : null}

              {postFormik.touched.video && postFormik.errors.video ? (
                <p className="detail-form-message detail-form-message-error">
                  {postFormik.errors.video}
                </p>
              ) : null}

              {formError ? (
                <p className="detail-form-message detail-form-message-error">
                  {formError}
                </p>
              ) : null}

              {formSuccess ? (
                <p className="detail-form-message detail-form-message-success">
                  {formSuccess}
                </p>
              ) : null}

              <div className="detail-modal-actions">
                <PrimaryButton
                  className="dashboard-button-inline"
                  variant="ghost"
                  onClick={closeModal}
                  type="button"
                >
                  Cancel
                </PrimaryButton>
                <PrimaryButton
                  className="dashboard-button-inline detail-action-button"
                  type="submit"
                  disabled={postFormik.isSubmitting || disableAddPost}
                >
                  {postFormik.isSubmitting ? "Creating..." : "Create post"}
                </PrimaryButton>
              </div>
            </form>
          )}
        </ModalShell>
      ) : null}

      {editingPost ? (
        <div className="detail-modal-overlay" role="dialog" aria-modal="true">
          <div className="detail-modal detail-editor-modal">
            <div className="detail-modal-header">
              <h3 className="detail-modal-title">Video editor</h3>
              <button
                type="button"
                className="detail-icon-button"
                onClick={closeEditModal}
                aria-label="Close editor"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="detail-modal-body detail-editor-body">
              <div className="detail-editor-preview">
                {getPostPreviewSrc(editingPost) ? (
                  <video
                    className="detail-editor-video"
                    src={getPostPreviewSrc(editingPost)}
                    controls
                  />
                ) : (
                  <div className="detail-editor-empty">Preview unavailable</div>
                )}

                <div className="detail-editor-meta">
                  <span className="detail-editor-chip">
                    {editingPost?.clip_moment?.start_time || "—"} -{" "}
                    {editingPost?.clip_moment?.end_time || "—"}
                  </span>
                  <span className="detail-editor-chip">
                    {editingPost?.clip_moment?.viral_score
                      ? `Viral ${editingPost.clip_moment.viral_score}`
                      : "Queued"}
                  </span>
                </div>
              </div>

              <form
                className="detail-editor-panel"
                onSubmit={editPostFormik.handleSubmit}
              >
                <label className="detail-form-field detail-form-field-wide">
                  <span className="detail-form-label">Caption</span>
                  <textarea
                    className="detail-form-input detail-form-textarea"
                    name="content"
                    value={editPostFormik.values.content}
                    onChange={editPostFormik.handleChange}
                    onBlur={editPostFormik.handleBlur}
                    rows={8}
                  />
                </label>

                <label className="detail-form-field detail-form-field-wide">
                  <span className="detail-form-label">Publish at</span>
                  <input
                    className="detail-form-input"
                    type="datetime-local"
                    name="publish_at"
                    value={editPostFormik.values.publish_at}
                    onChange={editPostFormik.handleChange}
                    onBlur={editPostFormik.handleBlur}
                  />
                </label>

                <label className="detail-form-field detail-form-field-wide">
                  <span className="detail-form-label">External ID</span>
                  <div className="detail-form-static">
                    {editingPost.external_id || "—"}
                  </div>
                </label>

                <label className="detail-form-field detail-form-field-wide">
                  <span className="detail-form-label">Replace video</span>
                  <input
                    className="detail-form-input"
                    type="file"
                    name="video"
                    accept="video/*"
                    onChange={(event) => {
                      editPostFormik.setFieldValue(
                        "video",
                        event.currentTarget.files?.[0] || null
                      );
                    }}
                    onBlur={() => editPostFormik.setFieldTouched("video", true)}
                  />
                </label>

                <label className="detail-form-field detail-form-field-wide">
                  <span className="detail-form-label">Assigned targets</span>
                  <div className="detail-form-static detail-form-static-wrap">
                    {summarizeTargets(editingPost.targets)}
                  </div>
                </label>

                {editPostFormik.touched.content && editPostFormik.errors.content ? (
                  <p className="detail-form-message detail-form-message-error">
                    {editPostFormik.errors.content}
                  </p>
                ) : null}

                {editPostFormik.touched.publish_at &&
                editPostFormik.errors.publish_at ? (
                  <p className="detail-form-message detail-form-message-error">
                    {editPostFormik.errors.publish_at}
                  </p>
                ) : null}

                {formError ? (
                  <p className="detail-form-message detail-form-message-error">
                    {formError}
                  </p>
                ) : null}

                {formSuccess ? (
                  <p className="detail-form-message detail-form-message-success">
                    {formSuccess}
                  </p>
                ) : null}

                <div className="detail-modal-actions">
                  <PrimaryButton
                    className="dashboard-button-inline"
                    variant="ghost"
                    type="button"
                    onClick={closeEditModal}
                  >
                    Close
                  </PrimaryButton>
                  <PrimaryButton
                    className="dashboard-button-inline detail-action-button"
                    type="submit"
                    disabled={editPostFormik.isSubmitting}
                  >
                    {editPostFormik.isSubmitting ? "Saving..." : "Save changes"}
                  </PrimaryButton>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
