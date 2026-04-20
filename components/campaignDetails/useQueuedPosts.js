import { useEffect } from "react";

import { toDateTimeInputValue } from "@/components/campaignDetails/utils";

export default function useQueuedPosts({
  editingPost,
  metric,
  postRows,
  publishDrafts,
  setDeletingPostId,
  setEditingPost,
  setFormError,
  setFormSuccess,
  setInlineSavingId,
  setPostDetailsById,
  setPostRows,
  setPublishDrafts,
}) {
  useEffect(() => {
    if (metric !== "queuedPosts") return;
    let cancelled = false;

    async function loadQueuedDetails() {
      try {
        const entries = await Promise.all(postRows.map(async (post) => {
          try {
            const response = await fetch(`/api/posts/${post.id}`);
            const payload = await response.json();
            return !response.ok || !payload?.success ? [post.id, post] : [post.id, payload.data];
          } catch {
            return [post.id, post];
          }
        }));
        if (cancelled) return;
        const nextDetails = Object.fromEntries(entries);
        setPostDetailsById(nextDetails);
        setPublishDrafts((current) => ({ ...current, ...Object.fromEntries(entries.map(([id, detail]) => [id, toDateTimeInputValue(detail?.publish_at)])) }));
        setPostRows((current) => current.map((post) => nextDetails[post.id] || post));
      } catch {}
    }

    void loadQueuedDetails();
    return () => { cancelled = true; };
  }, [metric, postRows.length, setPostDetailsById, setPostRows, setPublishDrafts]);

  async function openPostEditor(post) {
    setFormError("");
    setFormSuccess("");
    try {
      const response = await fetch(`/api/posts/${post.id}`);
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to load post details");
      setPostDetailsById((current) => ({ ...current, [post.id]: payload.data }));
      setEditingPost(payload.data);
    } catch (error) {
      setFormError(error.message || "Failed to load post details");
    }
  }

  async function saveInlinePublishAt(postId) {
    const nextPublishAt = String(publishDrafts[postId] || "").trim();
    if (!nextPublishAt) return setFormError("Publish time is required");
    setInlineSavingId(postId);
    setFormError("");
    setFormSuccess("");
    try {
      const response = await fetch(`/api/posts/${postId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publish_at: nextPublishAt }) });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to update publish time");
      setPostRows((current) => current.map((post) => (post.id === postId ? payload.data : post)));
      setPostDetailsById((current) => ({ ...current, [postId]: payload.data }));
      setPublishDrafts((current) => ({ ...current, [postId]: toDateTimeInputValue(payload.data?.publish_at) }));
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
      const response = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to delete post");
      setPostRows((current) => current.filter((post) => post.id !== postId));
      setPostDetailsById((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== postId)));
      setPublishDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== postId)));
      if (editingPost?.id === postId) setEditingPost(null);
      setFormSuccess("Queued post deleted.");
    } catch (error) {
      setFormError(error.message || "Failed to delete post");
    } finally {
      setDeletingPostId("");
    }
  }

  return { deleteQueuedPost, openPostEditor, saveInlinePublishAt };
}
