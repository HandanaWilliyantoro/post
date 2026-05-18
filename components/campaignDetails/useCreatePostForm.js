import { useFormik } from "formik";
import * as Yup from "yup";

import {
  easternDateTimeInputToIso,
  getEasternDateTimeInputAfterMinutes,
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
  const defaultPublishAt = getEasternDateTimeInputAfterMinutes(60);

  return useFormik({
    initialValues: {
      content: "",
      minPublishAt: defaultPublishAt,
      publish_at: defaultPublishAt,
      video: null,
    },
    validationSchema: Yup.object({
      content: Yup.string()
        .trim()
        .required("Content is required to post"),
      publish_at: Yup.string()
        .required("Publish time is required to post")
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
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to create post");
        }
        const targetCount = Number(payload?.meta?.targetCount || 0);
        const queued = payload?.meta?.queued === true;
        if (payload?.data) {
          setPostRows((current) => [payload.data, ...current]);
        }
        setFormSuccess(
          queued
            ? `Post queued in the background for ${targetCount} account${targetCount === 1 ? "" : "s"}.`
            : `Post created and targeted ${targetCount} account${targetCount === 1 ? "" : "s"}.`
        );
        helpers.resetForm({
          values: {
            content: "",
            minPublishAt: getEasternDateTimeInputAfterMinutes(60),
            publish_at: getEasternDateTimeInputAfterMinutes(60),
            video: null,
          },
        });
        router.reload();
      } catch (error) {
        setFormError(error.message || "Failed to submit post");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });
}
