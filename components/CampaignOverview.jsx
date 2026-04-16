import { memo, useEffect, useState } from "react";
import { useFormik } from "formik";
import { useRouter } from "next/router";
import * as Yup from "yup";

import PrimaryButton from "@/components/PrimaryButton";
import ProgressBar from "@/components/ProgressBar";

const metricDefinitions = [
  {
    key: "totalAccounts",
    label: "Total Number of Accounts",
  },
  {
    key: "totalPosts",
    label: "Total Posted Content",
  },
  {
    key: "queuedPosts",
    label: "Total Queued Content",
  },
];

const MetricChartCard = memo(function MetricChartCard({
  label,
  value,
  active,
  loading,
  disabled,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`campaign-chart-card ${active ? "campaign-chart-card-active" : ""} ${
        loading ? "campaign-chart-card-loading" : ""
      }`}
    >
      <div className="campaign-chart-card-top">
        <div>
          <p className="campaign-card-label">{label}</p>
          <p className="campaign-chart-value">{value}</p>
        </div>
      </div>

      {loading ? (
        <div className="campaign-chart-loading-overlay" aria-hidden="true">
          <span className="campaign-chart-spinner" />
          <span className="campaign-chart-loading-text">Opening details</span>
        </div>
      ) : null}
    </button>
  );
});

function BulkPublishProgressModal({ progress, onClose }) {
  if (!progress) {
    return null;
  }

  return (
    <div className="detail-modal-overlay" role="dialog" aria-modal="true">
      <div className="detail-modal campaign-progress-modal">
        <div className="detail-modal-header">
          <h3 className="detail-modal-title">Bulk Publish Progress</h3>
          <button
            type="button"
            className="detail-icon-button"
            onClick={onClose}
            aria-label="Close progress dialog"
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

        <div className="detail-modal-body campaign-progress-body">
          <div className="campaign-progress-topline">
            <span className="dashboard-section-label">Campaign</span>
            <span className="dashboard-badge dashboard-badge-accent">
              {progress.status || "running"}
            </span>
          </div>

          <p className="campaign-progress-copy">
            Background scheduling is active for this campaign. You can keep using
            other campaign pages while this continues.
          </p>

          <ProgressBar percentage={progress.percentage || 0} />

          <div className="campaign-progress-stats">
            <div className="dashboard-stat-card">
              <p className="dashboard-stat-label">Start Date</p>
              <p className="dashboard-stat-value">
                {progress.startDate || "—"}
              </p>
            </div>
            <div className="dashboard-stat-card">
              <p className="dashboard-stat-label">Completed</p>
              <p className="dashboard-stat-value">
                {progress.completedCount || 0} / {progress.totalCount || 0}
              </p>
            </div>
          </div>

          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">Folder Path</p>
            <p className="campaign-progress-path-value">{progress.videoDir || "—"}</p>
          </div>

          {progress.error ? (
            <p className="detail-form-message detail-form-message-error">
              {progress.error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function CampaignOverview({ campaign }) {
  const router = useRouter();
  const [activeMetricKey, setActiveMetricKey] = useState("totalPosts");
  const [pendingMetricKey, setPendingMetricKey] = useState(null);
  const [schedulerError, setSchedulerError] = useState("");
  const [schedulerSuccess, setSchedulerSuccess] = useState("");
  const [autoClipsError, setAutoClipsError] = useState("");
  const [autoClipsSuccess, setAutoClipsSuccess] = useState("");
  const [autoClipsResult, setAutoClipsResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const isPending = pendingMetricKey !== null;

  const openDetails = (metricKey) => {
    if (isPending) {
      return;
    }

    setActiveMetricKey(metricKey);
    setPendingMetricKey(metricKey);
    router.push({
      pathname: "/campaign-details/[slug]",
      query: {
        slug: campaign.slug,
        metric: metricKey,
      },
    });
  };

  const schedulerFormik = useFormik({
    initialValues: {
      startDate: "",
      videoDir: "",
    },
    validationSchema: Yup.object({
      startDate: Yup.string().required("Start date is required"),
      videoDir: Yup.string().trim().required("Folder path is required"),
    }),
    onSubmit: async (values, helpers) => {
      setSchedulerError("");
      setSchedulerSuccess("");

      try {
        const response = await fetch("/api/bulk-publish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            campaignSlug: campaign.slug,
            startDate: values.startDate,
            videoDir: values.videoDir,
          }),
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to start bulk publish");
        }

        setSchedulerSuccess("Bulk publish started in the background.");
        setProgress((current) => ({
          ...(current || {}),
          campaignSlug: campaign.slug,
          startDate: values.startDate,
          videoDir: values.videoDir,
          status: "queued",
          percentage: 0,
          completedCount: 0,
          totalCount: 0,
        }));
        setShowProgressModal(true);
      } catch (error) {
        setSchedulerError(error.message || "Failed to start bulk publish");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const isCurrentCampaignRunning =
    progress?.campaignSlug === campaign.slug &&
    (progress?.status === "queued" || progress?.status === "running");
  const isAnyJobActive =
    progress?.status === "queued" || progress?.status === "running";
  const supportsBulkPublish = campaign.slug === "lospollostv-campaign";
  const supportsAutoClips = !supportsBulkPublish;

  const autoClipsFormik = useFormik({
    initialValues: {
      youtubeUrl: "",
      videoFile: null,
    },
    validationSchema: Yup.object({
      youtubeUrl: Yup.string().test(
        "youtube-or-file",
        "Provide a YouTube URL or upload a file",
        function validate(value) {
          return Boolean(String(value || "").trim() || this.parent.videoFile);
        }
      ),
      videoFile: Yup.mixed().nullable(),
    }),
    onSubmit: async (values, helpers) => {
      setAutoClipsError("");
      setAutoClipsSuccess("");
      setAutoClipsResult(null);

      try {
        const formData = new FormData();
        formData.append("campaignSlug", campaign.slug);

        if (values.youtubeUrl) {
          formData.append("youtubeUrl", values.youtubeUrl);
        }

        if (values.videoFile) {
          formData.append("videoFile", values.videoFile);
        }

        const response = await fetch("/api/auto-clips", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Failed to generate auto clips");
        }

        setAutoClipsSuccess(
          `Generated ${payload?.moments?.length || 0} clips and scheduled their posts from ${payload.outputDir}.`
        );
        setAutoClipsResult(payload);
      } catch (error) {
        setAutoClipsError(error.message || "Failed to generate auto clips");
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  return (
    <section className="campaign-overview">
      <header className="campaign-top-header">
        <h1 className="campaign-top-title">{campaign.label}</h1>
        <p className="campaign-top-description">{campaign.description}</p>
      </header>

      <div className="campaign-charts-grid">
        {metricDefinitions.map((metric) => (
          <MetricChartCard
            key={metric.key}
            label={metric.label}
            value={campaign.metrics[metric.key].value}
            active={activeMetricKey === metric.key}
            loading={pendingMetricKey === metric.key && isPending}
            disabled={isPending}
            onClick={() => openDetails(metric.key)}
          />
        ))}

        {isPending ? (
          <div className="campaign-grid-loading">
            <span className="campaign-grid-loading-spinner" />
            <p className="campaign-grid-loading-title">Loading detail view</p>
            <p className="campaign-grid-loading-copy">
              Pulling the selected campaign data into the table.
            </p>
          </div>
        ) : null}
      </div>

      {supportsBulkPublish ? (
        <section className="dashboard-card campaign-scheduler-card">
          <div className="dashboard-card-header">
            <div>
              <p className="dashboard-section-label">Bulk Publish</p>
              <h3 className="dashboard-card-title">Schedule this campaign</h3>
            </div>
            {isCurrentCampaignRunning ? (
              <button
                type="button"
                className="dashboard-badge dashboard-badge-accent campaign-progress-trigger"
                onClick={() => setShowProgressModal(true)}
              >
                View progress
              </button>
            ) : null}
          </div>

          <form
            className="campaign-scheduler-form"
            onSubmit={schedulerFormik.handleSubmit}
          >
            <label className="campaign-scheduler-field">
              <span className="detail-form-label">Start Date</span>
              <input
                className="detail-form-input"
                name="startDate"
                type="date"
                value={schedulerFormik.values.startDate}
                onChange={schedulerFormik.handleChange}
                onBlur={schedulerFormik.handleBlur}
                required
              />
            </label>

            <label className="campaign-scheduler-field campaign-scheduler-field-wide">
              <span className="detail-form-label">Folder Path</span>
              <input
                className="detail-form-input"
                name="videoDir"
                value={schedulerFormik.values.videoDir}
                onChange={schedulerFormik.handleChange}
                onBlur={schedulerFormik.handleBlur}
                placeholder="C:\\Users\\USER\\Videos\\Assets\\..."
                required
              />
            </label>

            {schedulerFormik.touched.startDate && schedulerFormik.errors.startDate ? (
              <p className="detail-form-message detail-form-message-error">
                {schedulerFormik.errors.startDate}
              </p>
            ) : null}

            {schedulerFormik.touched.videoDir && schedulerFormik.errors.videoDir ? (
              <p className="detail-form-message detail-form-message-error">
                {schedulerFormik.errors.videoDir}
              </p>
            ) : null}

            {schedulerError ? (
              <p className="detail-form-message detail-form-message-error">
                {schedulerError}
              </p>
            ) : null}

            {schedulerSuccess ? (
              <p className="detail-form-message detail-form-message-success">
                {schedulerSuccess}
              </p>
            ) : null}

            <div className="detail-modal-actions">
              <PrimaryButton
                className="dashboard-button-inline detail-action-button"
                type="submit"
                disabled={schedulerFormik.isSubmitting || isAnyJobActive}
              >
                {schedulerFormik.isSubmitting ? "Starting..." : "Start bulk publish"}
              </PrimaryButton>
            </div>
          </form>
        </section>
      ) : null}

      {supportsAutoClips ? (
        <section className="dashboard-card campaign-scheduler-card">
          <div className="dashboard-card-header">
            <div>
              <p className="dashboard-section-label">Auto Clips</p>
              <h3 className="dashboard-card-title">Analyze and download moments</h3>
            </div>
          </div>

          <form
            className="campaign-scheduler-form"
            onSubmit={autoClipsFormik.handleSubmit}
          >
            <label className="campaign-scheduler-field campaign-scheduler-field-wide">
              <span className="detail-form-label">YouTube Video URL</span>
              <input
                className="detail-form-input"
                name="youtubeUrl"
                value={autoClipsFormik.values.youtubeUrl}
                onChange={autoClipsFormik.handleChange}
                onBlur={autoClipsFormik.handleBlur}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </label>

            <label className="campaign-scheduler-field campaign-scheduler-field-wide">
              <span className="detail-form-label">Upload File</span>
              <input
                className="detail-form-input"
                name="videoFile"
                type="file"
                accept="video/*"
                onChange={(event) =>
                  autoClipsFormik.setFieldValue(
                    "videoFile",
                    event.currentTarget.files?.[0] || null
                  )
                }
                onBlur={() => autoClipsFormik.setFieldTouched("videoFile", true)}
              />
            </label>

            {autoClipsFormik.touched.youtubeUrl && autoClipsFormik.errors.youtubeUrl ? (
              <p className="detail-form-message detail-form-message-error">
                {autoClipsFormik.errors.youtubeUrl}
              </p>
            ) : null}

            {autoClipsError ? (
              <p className="detail-form-message detail-form-message-error">
                {autoClipsError}
              </p>
            ) : null}

            {autoClipsSuccess ? (
              <p className="detail-form-message detail-form-message-success">
                {autoClipsSuccess}
              </p>
            ) : null}

            <div className="detail-modal-actions">
              <PrimaryButton
                className="dashboard-button-inline detail-action-button"
                type="submit"
                disabled={autoClipsFormik.isSubmitting}
              >
                {autoClipsFormik.isSubmitting ? "Generating..." : "Generate auto clips"}
              </PrimaryButton>
            </div>
          </form>

          {autoClipsResult?.moments?.length ? (
            <div className="campaign-auto-clips-results">
              <p className="dashboard-section-label">Downloaded Clips</p>
              <div className="campaign-auto-clips-list">
                {autoClipsResult.moments.map((moment, index) => (
                  <article key={`${moment.title}-${index}`} className="campaign-auto-clips-item">
                    <div className="campaign-auto-clips-head">
                      <h4 className="campaign-auto-clips-title">{moment.title}</h4>
                      <span className="campaign-auto-clips-score">
                        Viral {moment.viral_score}
                      </span>
                    </div>
                    <p className="campaign-auto-clips-meta">
                      {moment.start_time} - {moment.end_time}
                    </p>
                    <p className="campaign-auto-clips-path">{moment.output_path}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {isPending ? (
        <p className="campaign-detail-hint">Opening details…</p>
      ) : (
        <p className="campaign-detail-hint">
          Tip: Click a chart card to drill into the underlying accounts or posts.
        </p>
      )}

      {supportsBulkPublish && showProgressModal && isCurrentCampaignRunning ? (
        <BulkPublishProgressModal
          progress={progress}
          onClose={() => setShowProgressModal(false)}
        />
      ) : null}
    </section>
  );
}
