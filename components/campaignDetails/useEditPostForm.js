import { useFormik } from "formik";
import * as Yup from "yup";

import { toDateTimeInputValue } from "@/components/campaignDetails/utils";

export default function useEditPostForm({ editingPost, setEditingPost, setFormError, setFormSuccess, setPostDetailsById, setPostRows, setPublishDrafts }) {
  return useFormik({
    enableReinitialize: true,
    initialValues: { content: editingPost?.content || "", publish_at: toDateTimeInputValue(editingPost?.publish_at), video: null },
    validationSchema: Yup.object({
      content: Yup.string().trim().required("Content is required"),
      publish_at: Yup.string().required("Publish time is required"),
      video: Yup.mixed().nullable(),
    }),
    onSubmit: async (values, helpers) => {
      if (!editingPost?.id) return helpers.setSubmitting(false);
      setFormError("");
      setFormSuccess("");
      try {
        const formData = new FormData();
        formData.append("content", values.content);
        formData.append("publish_at", values.publish_at);
        if (values.video) formData.append("video", values.video);
        const response = await fetch(`/api/posts/${editingPost.id}`, { method: "PATCH", body: formData });
        const payload = await response.json();
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to update post");
        const previousPostId = payload.replacedPostId || editingPost.id;
        setPostRows((current) => current.map((post) => (post.id === previousPostId ? payload.data : post)));
        setPostDetailsById((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([id]) => id !== previousPostId)), [payload.data.id]: payload.data }));
        setPublishDrafts((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([id]) => id !== previousPostId)), [payload.data.id]: toDateTimeInputValue(payload.data?.publish_at) }));
        setEditingPost(payload.data);
        setFormSuccess("Queued post updated.");
      } catch (error) {
        setFormError(error.message || "Failed to update post");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });
}
