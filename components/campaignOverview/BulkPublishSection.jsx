import { useFormik } from "formik";
import * as Yup from "yup";
import { useMemo } from "react";

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

const validationSchema = Yup.object({
  caption: Yup.string().trim().required("Caption is required"),
  publishAt: Yup.string()
    .required("Publish time is required")
    .test(
      "is-future-publish-time",
      "Publish time must be current or future Eastern time",
      isFutureEasternDateTime
    ),
  publishMode: Yup.string()
    .oneOf(["same-time", "stagger-2h"])
    .required("Publish type is required"),
  videoDir: Yup.string().trim().required("Folder path is required"),
});

export default function BulkPublishSection({
  campaignSlug,
  disabled,
  error,
  success,
  hasProgress,
  isRunning,
  isBlockedByOtherCampaign,
  activeCampaignSlug,
  progressLoading,
  onLoadProgress,
  onSubmit,
}) {
  const minimumPublishAt = useMemo(
    () => getCurrentEasternDateTimeInput(),
    []
  );
  const formik = useFormik({
    initialValues: {
      caption: "",
      publishAt: minimumPublishAt,
      publishMode: "same-time",
      videoDir: "",
    },
    validationSchema,
    onSubmit,
  });
  useFormErrorSnackbar(formik);
  const isStaggeredMode = formik.values.publishMode === "stagger-2h";
  const submitLabel = formik.isSubmitting
    ? "Starting..."
    : isRunning
      ? "Bulk publish running"
      : isBlockedByOtherCampaign
        ? "Another bulk run is active"
        : "Start bulk publish";
  const disabledMessage = isRunning
    ? "A bulk publish run is already in progress for this campaign. Open View progress to monitor it."
    : isBlockedByOtherCampaign
      ? `Another bulk publish run is active for ${activeCampaignSlug || "another campaign"}. Wait until it finishes before starting a new one here.`
      : "";

  return (
    <section className="dashboard-card campaign-scheduler-card">
      <div className="dashboard-card-header">
        <div>
          <p className="dashboard-section-label">Bulk Publish</p>
          <h3 className="dashboard-card-title">Queue a folder of videos</h3>
        </div>
        {hasProgress ? (
          <button type="button" className="dashboard-badge dashboard-badge-accent campaign-progress-trigger" onClick={onLoadProgress}>
            {progressLoading ? "Loading..." : "View progress"}
          </button>
        ) : null}
      </div>

      <form className="campaign-scheduler-form" onSubmit={formik.handleSubmit}>
        <div className="campaign-scheduler-intro">
          <span className="campaign-scheduler-kicker">{isStaggeredMode ? "Sequential 2-Hour Queue" : "Username-Matched Queue"}</span>
          <p className="campaign-scheduler-copy">
            {isStaggeredMode
              ? "Drop in a folder of videos, choose one caption, and schedule them through PostOnce every 2 hours. In this mode filenames are ignored and accounts rotate in order."
              : "Drop in a folder of videos named after assigned account usernames, choose one caption for the run, and let the scheduler create the PostOnce posts in sequence."}
          </p>

          <div className="campaign-scheduler-steps">
            <div className="campaign-scheduler-step">
              <span className="campaign-scheduler-step-index">01</span>
              <p className="campaign-scheduler-step-copy">{isStaggeredMode ? "Folder videos are processed in filename order." : "Name each file after the assigned username."}</p>
            </div>
            <div className="campaign-scheduler-step">
              <span className="campaign-scheduler-step-index">02</span>
              <p className="campaign-scheduler-step-copy">{isStaggeredMode ? "Assigned accounts rotate in username order. After the last account, the next video loops back to the first account." : "Use one caption for the entire matched batch."}</p>
            </div>
            <div className="campaign-scheduler-step">
              <span className="campaign-scheduler-step-index">03</span>
              <p className="campaign-scheduler-step-copy">{isStaggeredMode ? "Each next video is scheduled 2 hours after the previous one." : "Choose either one shared publish time or a 2-hour stagger across the matched files."}</p>
            </div>
          </div>

          <div className="campaign-scheduler-example">
            <span className="detail-form-label">{isStaggeredMode ? "Sequence Rule" : "Filename Match"}</span>
            <div className="campaign-scheduler-example-row">
              {isStaggeredMode ? (
                <>
                  <span className="campaign-scheduler-example-pill">01-first-video.mp4</span>
                  <span className="campaign-scheduler-example-arrow">-&gt;</span>
                  <span className="campaign-scheduler-example-pill campaign-scheduler-example-pill-accent">first assigned username</span>
                  <span className="campaign-scheduler-example-arrow">...</span>
                  <span className="campaign-scheduler-example-pill">06-sixth-video.mp4</span>
                  <span className="campaign-scheduler-example-arrow">-&gt;</span>
                  <span className="campaign-scheduler-example-pill campaign-scheduler-example-pill-accent">first assigned username again</span>
                </>
              ) : (
                <>
                  <span className="campaign-scheduler-example-pill">policytalks.tv.mp4</span>
                  <span className="campaign-scheduler-example-arrow">-&gt;</span>
                  <span className="campaign-scheduler-example-pill campaign-scheduler-example-pill-accent">@policytalks.tv</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="campaign-scheduler-workspace">
          <label className="detail-form-field campaign-scheduler-panel campaign-scheduler-panel-caption">
            <span className="detail-form-label">Caption</span>
            <textarea className="detail-form-input detail-form-textarea campaign-scheduler-caption-input" name="caption" value={formik.values.caption} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Type the caption to use for every matched post in this run" rows={5} required />
            <span className="detail-post-subtle">This caption is reused for every scheduled post in the run.</span>
          </label>

          <div className="campaign-scheduler-row">
            <label className="detail-form-field campaign-scheduler-panel">
              <span className="detail-form-label">Publish Type</span>
              <select className="detail-form-input" name="publishMode" value={formik.values.publishMode} onChange={formik.handleChange} onBlur={formik.handleBlur}>
                <option value="same-time">Same time</option>
                <option value="stagger-2h">Every 2 hours</option>
              </select>
              <span className="detail-post-subtle">`Same time` requires filename-to-username matching. `Every 2 hours` ignores filenames and rotates folder videos across accounts in order.</span>
            </label>

            <label className="detail-form-field campaign-scheduler-panel">
              <span className="detail-form-label">Publish At (Eastern Time)</span>
              <input className="detail-form-input" name="publishAt" type="datetime-local" value={formik.values.publishAt} min={minimumPublishAt} onChange={formik.handleChange} onBlur={formik.handleBlur} required />
              <span className="detail-post-subtle">{isStaggeredMode ? "This is the first scheduled post time. Each next video in the rotation is scheduled 2 hours later." : "All matched account posts will use this same scheduled publish time. Current or future ET is allowed."}</span>
            </label>
          </div>

          <label className="detail-form-field campaign-scheduler-panel">
            <span className="detail-form-label">Folder Path</span>
            <input className="detail-form-input campaign-scheduler-path-input" name="videoDir" value={formik.values.videoDir} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="C:\\Users\\USER\\Videos\\Assets\\..." required />
            <span className="detail-post-subtle">{isStaggeredMode ? "Videos are processed in filename order and accounts keep rotating until the whole folder is scheduled." : "Files without a username match are skipped and reported in progress."}</span>
          </label>

          <div className="campaign-scheduler-note">
            <span className="detail-form-label">Posting Mode</span>
            <p className="campaign-scheduler-note-copy">{isStaggeredMode ? "Folder videos are rotated across assigned campaign accounts in username order, ignoring filenames, then queued through PostOnce starting at the chosen time with a 2-hour gap between each post." : "Matched files are queued through PostOnce for the same publish time instead of being spread across a schedule."}</p>
          </div>

          {formik.touched.caption && formik.errors.caption ? <p className="detail-form-message detail-form-message-error">{formik.errors.caption}</p> : null}
          {formik.touched.publishMode && formik.errors.publishMode ? <p className="detail-form-message detail-form-message-error">{formik.errors.publishMode}</p> : null}
          {formik.touched.publishAt && formik.errors.publishAt ? <p className="detail-form-message detail-form-message-error">{formik.errors.publishAt}</p> : null}
          {formik.touched.videoDir && formik.errors.videoDir ? <p className="detail-form-message detail-form-message-error">{formik.errors.videoDir}</p> : null}
          {error ? <p className="detail-form-message detail-form-message-error">{error}</p> : null}
          {success ? <p className="detail-form-message detail-form-message-success">{success}</p> : null}
          {disabledMessage ? <p className="detail-form-message">{disabledMessage}</p> : null}

          <div className="campaign-scheduler-actions">
            <PrimaryButton className="dashboard-button-inline detail-action-button campaign-scheduler-submit" type="submit" disabled={formik.isSubmitting || disabled}>
              {submitLabel}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </section>
  );
}
