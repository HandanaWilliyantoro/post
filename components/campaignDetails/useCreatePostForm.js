import { useFormik } from "formik";
import * as Yup from "yup";

import {
  easternDateTimeInputToIso,
  getCurrentEasternDateTimeInput,
} from "@/lib/utils/easternTime";

function isFutureEasternDateTime(value) {
  if (!String(value || "").trim()) {
    return false;
  }

  try {
    const isoValue = easternDateTimeInputToIso(value);
    const currentEasternMinuteIso = easternDateTimeInputToIso(
      getCurrentEasternDateTimeInput()
    );

    return (
      new Date(isoValue).getTime() >=
      new Date(currentEasternMinuteIso).getTime()
    );
  } catch {
    return false;
  }
}

export default function useCreatePostForm({ campaignSlug, router, setFormError, setFormSuccess, setPostRows }) {
  return useFormik({
    initialValues: {
      content: "",
      publish_at: getCurrentEasternDateTimeInput(),
      video: null,
    },
    validationSchema: Yup.object({
      content: Yup.string().trim().required("Content is required"),
      publish_at: Yup.string()
        .required("Publish time is required")
        .test(
          "is-future-publish-time",
          "Publish time must be current or future Eastern time",
          isFutureEasternDateTime
        ),
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
        helpers.resetForm({
          values: {
            content: "",
            publish_at: getCurrentEasternDateTimeInput(),
            video: null,
          },
        });
        router.replace(router.asPath, undefined, { scroll: false });
      } catch (error) {
        setFormError(error.message || "Failed to create post");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });
}
