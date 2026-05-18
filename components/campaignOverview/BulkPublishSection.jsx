import { useMemo } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";

import PrimaryButton from "@/components/PrimaryButton";
import useFormErrorSnackbar from "@/components/useFormErrorSnackbar";
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

function resolveInitialPublishAt(defaultPublishAt = "") {
  const normalizedDefault = String(defaultPublishAt || "").trim();

  if (isFutureEasternDateTime(normalizedDefault)) {
    return normalizedDefault;
  }

  return getCurrentEasternDateTimeInput();
}

const validationSchema = Yup.object({
  caption: Yup.string().trim().required("Caption is required"),
  publishAt: Yup.string()
    .required("Publish time is required")
    .test(
      "is-future-publish-time",
      "Publish time must be current or future Eastern time",
      isFutureEasternDateTime
    ),
  videoDir: Yup.string().trim().required("Folder path is required"),
});

export default function BulkPublishSection({
  assignedAccountCount = 0,
  defaultPublishAt = "",
  error,
  success,
  hasActiveRun,
  hasProgress,
  progressLoading,
  canRetryAnyFailedRuns = false,
  retryAllFailedMessage = "",
  retryFailedLoading = false,
  onLoadProgress,
  onRetryAllFailed,
  onSubmit,
}) {
  const minimumPublishAt = useMemo(() => getCurrentEasternDateTimeInput(), []);
  const initialPublishAt = useMemo(
    () => resolveInitialPublishAt(defaultPublishAt),
    [defaultPublishAt]
  );
  const formik = useFormik({
    initialValues: {
      caption: "",
      publishAt: initialPublishAt,
      videoDir: "",
    },
    enableReinitialize: true,
    validationSchema,
    onSubmit: (values, helpers) =>
      onSubmit?.({ ...values, publishMode: "same-time" }, helpers),
  });

  useFormErrorSnackbar(formik);

  const normalizedAssignedAccountCount = Math.max(
    0,
    Number(assignedAccountCount) || 0
  );
  const submitLabel = formik.isSubmitting
    ? "Queueing..."
    : hasActiveRun
      ? "Queue another bulk publish"
      : "Start bulk publish";

  return (
    <section className="dashboard-card campaign-scheduler-card">
      <div className="dashboard-card-header">
        <div>
          <p className="dashboard-section-label">Bulk Publish</p>
          <h3 className="dashboard-card-title">Queue a folder of videos</h3>
        </div>
        {hasProgress ? (
          <button
            type="button"
            className="dashboard-badge dashboard-badge-accent campaign-progress-trigger"
            onClick={onLoadProgress}
          >
            {progressLoading ? "Loading..." : "View latest"}
          </button>
        ) : null}
      </div>

      <form className="campaign-scheduler-form" onSubmit={formik.handleSubmit}>
        <div className="campaign-scheduler-banner">
          <div className="campaign-scheduler-banner-copy">
            <p className="campaign-scheduler-banner-title">
              One folder. One caption. Same-time queue.
            </p>
            <p className="campaign-scheduler-banner-text">
              {hasActiveRun
                ? "A bulk publish run is already active, so this one will wait in line and start automatically."
                : "All matched videos are queued for the selected publish time in one batch."}
            </p>
          </div>

          <div className="campaign-scheduler-banner-pills">
            <span className="campaign-scheduler-banner-pill">
              {normalizedAssignedAccountCount} account
              {normalizedAssignedAccountCount === 1 ? "" : "s"}
            </span>
            <span className="campaign-scheduler-banner-pill">
              Filename match required
            </span>
            <span className="campaign-scheduler-banner-pill">
              {hasActiveRun ? "Queued behind active run" : "Ready to queue"}
            </span>
          </div>
        </div>

        <div className="campaign-scheduler-workspace">
          <label className="detail-form-field campaign-scheduler-panel campaign-scheduler-panel-wide campaign-scheduler-panel-caption">
            <span className="detail-form-label">Caption</span>
            <textarea
              className="detail-form-input detail-form-textarea campaign-scheduler-caption-input"
              name="caption"
              value={formik.values.caption}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              placeholder="Write the caption that should be used for every post in this run"
              rows={4}
              required
            />
          </label>

          <div className="campaign-scheduler-row campaign-scheduler-row-single">
            <label className="detail-form-field campaign-scheduler-panel">
              <span className="campaign-scheduler-panel-head">
                <span className="detail-form-label">Publish At</span>
                <span className="campaign-scheduler-inline-tag">Eastern time</span>
              </span>
              <input
                className="detail-form-input campaign-scheduler-datetime-input"
                name="publishAt"
                type="datetime-local"
                value={formik.values.publishAt}
                min={minimumPublishAt}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                required
              />
            </label>
          </div>

          <label className="detail-form-field campaign-scheduler-panel campaign-scheduler-panel-wide">
            <span className="campaign-scheduler-panel-head">
              <span className="detail-form-label">Folder Path</span>
              <span className="campaign-scheduler-inline-tag">Local machine</span>
            </span>
            <input
              className="detail-form-input campaign-scheduler-path-input"
              name="videoDir"
              value={formik.values.videoDir}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              placeholder="C:\\Users\\USER\\Videos\\Assets\\..."
              required
            />
          </label>

          {formik.touched.caption && formik.errors.caption ? (
            <p className="detail-form-message detail-form-message-error campaign-scheduler-feedback">
              {formik.errors.caption}
            </p>
          ) : null}
          {formik.touched.publishAt && formik.errors.publishAt ? (
            <p className="detail-form-message detail-form-message-error campaign-scheduler-feedback">
              {formik.errors.publishAt}
            </p>
          ) : null}
          {formik.touched.videoDir && formik.errors.videoDir ? (
            <p className="detail-form-message detail-form-message-error campaign-scheduler-feedback">
              {formik.errors.videoDir}
            </p>
          ) : null}
          {error ? (
            <p className="detail-form-message detail-form-message-error campaign-scheduler-feedback">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="detail-form-message detail-form-message-success campaign-scheduler-feedback">
              {success}
            </p>
          ) : null}
          {retryAllFailedMessage ? (
            <p className="detail-form-message campaign-scheduler-feedback">
              {retryAllFailedMessage}
            </p>
          ) : null}

          <div className="campaign-scheduler-actions">
            <PrimaryButton
              className="dashboard-button-inline campaign-scheduler-retry"
              type="button"
              variant="ghost"
              onClick={onRetryAllFailed}
              disabled={!canRetryAnyFailedRuns || retryFailedLoading || formik.isSubmitting}
            >
              {retryFailedLoading ? "Queueing failed posts..." : "Retry all failed posts"}
            </PrimaryButton>
            <PrimaryButton
              className="dashboard-button-inline detail-action-button campaign-scheduler-submit"
              type="submit"
              disabled={formik.isSubmitting || retryFailedLoading}
            >
              {submitLabel}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </section>
  );
}
