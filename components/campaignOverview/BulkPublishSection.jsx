import { useEffect, useMemo, useRef } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";

import PrimaryButton from "@/components/PrimaryButton";
import useFormErrorSnackbar from "@/components/useFormErrorSnackbar";
import {
  PUBLISH_MODE_SAME_TIME,
  PUBLISH_MODE_WAVE_SCHEDULE,
} from "@/lib/pipeline/bulkPublishModes";
import {
  easternDateTimeInputToIso,
  getCurrentEasternDateTimeInput,
  getDefaultBulkPublishDateTimeInput,
  normalizeBulkPublishDateTimeInput,
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

function resolveInitialPublishAt(defaultPublishAt = "", hourOffset = 2) {
  const normalizedDefault = String(defaultPublishAt || "").trim();

  if (normalizedDefault) {
    try {
      // SSR already computed: 2h after last post on this campaign only
      return normalizeBulkPublishDateTimeInput(normalizedDefault);
    } catch {
      // Fall through
    }
  }

  return getDefaultBulkPublishDateTimeInput(null, hourOffset);
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
  publishMode: Yup.string()
    .oneOf([PUBLISH_MODE_SAME_TIME, PUBLISH_MODE_WAVE_SCHEDULE])
    .required(),
});

export default function BulkPublishSection({
  assignedAccountCount = 0,
  campaignIntervalHours = 2,
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
    () => resolveInitialPublishAt(defaultPublishAt, campaignIntervalHours),
    [campaignIntervalHours, defaultPublishAt]
  );
  const publishAtTouchedByUserOrSubmit = useRef(false);
  const formik = useFormik({
    initialValues: {
      caption: "",
      publishAt: initialPublishAt,
      videoDir: "",
      publishMode: PUBLISH_MODE_SAME_TIME,
    },
    // Do not enableReinitialize — it was resetting publishAt after submit
    // back to the stale SSR default and looked like the field "never changed".
    enableReinitialize: false,
    validationSchema,
    onSubmit: (values, helpers) => onSubmit?.(values, helpers),
  });

  useEffect(() => {
    if (publishAtTouchedByUserOrSubmit.current) {
      return;
    }

    if (
      initialPublishAt &&
      initialPublishAt !== formik.values.publishAt &&
      !formik.touched.publishAt
    ) {
      formik.setFieldValue("publishAt", initialPublishAt, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync pristine default
  }, [initialPublishAt]);

  useFormErrorSnackbar(formik);

  const normalizedAssignedAccountCount = Math.max(
    0,
    Number(assignedAccountCount) || 0
  );
  const isWaveSchedule =
    formik.values.publishMode === PUBLISH_MODE_WAVE_SCHEDULE;
  const submitLabel = formik.isSubmitting
    ? "Queueing..."
    : hasActiveRun
      ? isWaveSchedule
        ? "Queue another Wave Schedule"
        : "Queue another bulk publish"
      : isWaveSchedule
        ? "Start Wave Schedule"
        : "Start bulk publish";
  const intervalCopy = `${campaignIntervalHours} hour${
    campaignIntervalHours === 1 ? "" : "s"
  }`;
  const pairingCopy = isWaveSchedule
    ? `Wave Schedule: sort videos in the folder (vid1, vid2, …). Wave 1 assigns vid1→account1 … vidN→accountN at the Publish At time. Wave 2 assigns the next N videos to the same accounts at the next ${intervalCopy} slot (from 7am ET). Supports 1000+ videos.`
    : `Same Time: the folder must contain exactly one video per assigned account. SWA videos must be named with the target account username. Every post shares one publish time on the campaign ${intervalCopy} grid (from 7am ET). After each run, Publish At advances to the next slot.`;

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

      <form
        className="campaign-scheduler-form"
        onSubmit={(event) => {
          publishAtTouchedByUserOrSubmit.current = true;
          formik.handleSubmit(event);
        }}
      >
        <div className="campaign-scheduler-banner">
          <div className="campaign-scheduler-banner-copy">
            <p className="campaign-scheduler-banner-title">
              {isWaveSchedule
                ? "Wave Schedule — many videos, timed waves"
                : "Same Time — one video per account"}
            </p>
            <p className="campaign-scheduler-banner-text">
              {hasActiveRun
                ? `A bulk publish run is already active, so this one will wait in line and start automatically. ${pairingCopy}`
                : pairingCopy}
            </p>
          </div>

          <div className="campaign-scheduler-banner-pills">
            <span className="campaign-scheduler-banner-pill">
              {normalizedAssignedAccountCount} account
              {normalizedAssignedAccountCount === 1 ? "" : "s"}
            </span>
            <span className="campaign-scheduler-banner-pill">
              {isWaveSchedule ? "N videos per wave" : "1 video per account"}
            </span>
            <span className="campaign-scheduler-banner-pill">
              {hasActiveRun ? "Queued behind active run" : "Ready to queue"}
            </span>
          </div>
        </div>

        <div className="campaign-scheduler-workspace">
          <fieldset className="detail-form-field campaign-scheduler-panel campaign-scheduler-panel-wide">
            <span className="detail-form-label">Publish mode</span>
            <div className="campaign-scheduler-mode-options">
              <label className="campaign-scheduler-mode-option">
                <input
                  type="radio"
                  name="publishMode"
                  value={PUBLISH_MODE_WAVE_SCHEDULE}
                  checked={isWaveSchedule}
                  onChange={formik.handleChange}
                />
                <span>
                  <strong>Wave Schedule</strong>
                  <span className="campaign-scheduler-mode-hint">
                    Round-robin accounts; each wave shares one slot from Publish
                    At (every {intervalCopy} from 7am ET)
                  </span>
                </span>
              </label>
              <label className="campaign-scheduler-mode-option">
                <input
                  type="radio"
                  name="publishMode"
                  value={PUBLISH_MODE_SAME_TIME}
                  checked={!isWaveSchedule}
                  onChange={formik.handleChange}
                />
                <span>
                  <strong>Same Time</strong>
                  <span className="campaign-scheduler-mode-hint">
                    Exactly one video per account, all at one slot (every{" "}
                    {intervalCopy} from 7am ET). Field advances after each
                    successful queue.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

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
                <span className="detail-form-label">
                  {isWaveSchedule ? "First wave Publish At" : "Publish At"}
                </span>
                <span className="campaign-scheduler-inline-tag">Eastern time</span>
              </span>
              <input
                className="detail-form-input campaign-scheduler-datetime-input"
                name="publishAt"
                type="datetime-local"
                value={formik.values.publishAt}
                min={minimumPublishAt}
                onChange={(event) => {
                  const value = String(event.target.value || "").trim();
                  publishAtTouchedByUserOrSubmit.current = true;

                  formik.setFieldValue(
                    "publishAt",
                    value ? normalizeBulkPublishDateTimeInput(value) : ""
                  );
                }}
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
