import { useFormik } from "formik";
import * as Yup from "yup";

export default function useCreatePostForm({ campaignSlug, router, setFormError, setFormSuccess, setPostRows }) {
  return useFormik({
    initialValues: { content: "", publish_at: "", video: null },
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
        formData.append("campaignSlug", campaignSlug);
        formData.append("content", values.content);
        formData.append("publish_at", values.publish_at);
        if (values.video) formData.append("video", values.video);
        const response = await fetch("/api/posts", { method: "POST", body: formData });
        const payload = await response.json();
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to create post");
        setPostRows((current) => [payload.data, ...current]);
        setFormSuccess(`Post created and targeted ${payload?.meta?.targetCount || 0} account${payload?.meta?.targetCount === 1 ? "" : "s"}.`);
        helpers.resetForm();
        router.replace(router.asPath, undefined, { scroll: false });
      } catch (error) {
        setFormError(error.message || "Failed to create post");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });
}
