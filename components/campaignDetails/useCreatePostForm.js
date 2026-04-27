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

function parseTitleVariants(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function useCreatePostForm({ campaignSlug, router, setFormError, setFormSuccess, setPostRows, assignedAccountsCount = 0 }) {
  return useFormik({
    initialValues: {
      content: "",
      titleVariants: "",
      publish_at: getCurrentEasternDateTimeInput(),
      video: null,
    },
    validationSchema: Yup.object({
      content: Yup.string().trim().required("Content is required"),
      titleVariants: Yup.string()
        .required("Comma-separated titles are required")
        .test(
          "has-titles",
          "Add at least one title",
          (value) => parseTitleVariants(value).length > 0
        )
        .test(
          "enough-titles",
          `Provide at least ${assignedAccountsCount} comma-separated title${assignedAccountsCount === 1 ? "" : "s"}`,
          (value) => {
            const titles = parseTitleVariants(value);
            return titles.length >= Math.max(1, assignedAccountsCount);
          }
        ),
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
        formData.append("titleVariants", values.titleVariants);
        formData.append("publish_at", values.publish_at);
        if (values.video) formData.append("video", values.video);
        const response = await fetch("/api/posts", { method: "POST", body: formData });
        const payload = await response.json();
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to create post");
        const createdCount = Number(payload?.meta?.createdCount || 0);
        const targetCount = Number(payload?.meta?.targetCount || 0);
        if (payload?.data) {
          setPostRows((current) => [payload.data, ...current]);
        }
        setFormSuccess(
          createdCount > 1
            ? `Created ${createdCount} post variants for ${targetCount} accounts.`
            : `Post created and targeted ${targetCount} account${targetCount === 1 ? "" : "s"}.`
        );
        helpers.resetForm({
          values: {
            content: "",
            titleVariants: "",
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
