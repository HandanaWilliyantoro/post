import { memo, useEffect, useState } from "react";
import { useFormik } from "formik";
import { useRouter } from "next/router";
import * as Yup from "yup";

import PrimaryButton from "@/components/PrimaryButton";
import ProgressBar from "@/components/ProgressBar";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";

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

function KickScanAccountCard({ row, onCopy }) {
  const urls = Array.isArray(row?.urls) ? row.urls : [];

  return (
    <article className="campaign-scan-account-card">
      <div className="campaign-scan-account-top">
        <div>
          <p className="campaign-scan-account-name">{row?.username || "Unknown"}</p>
          <p className="campaign-scan-account-meta">
            {urls.length} new post{urls.length === 1 ? "" : "s"}
          </p>
        </div>

        <button
          type="button"
          className="campaign-scan-account-copy"
          onClick={() => onCopy(row?.line || "")}
          disabled={!row?.line}
        >
          Copy line
        </button>
      </div>

      {urls.length ? (
        <div className="campaign-scan-link-grid">
          {urls.map((url, index) => (
            <a
              key={`${row?.username || "account"}-${index}`}
              className="campaign-scan-link-chip"
              href={url}
              target="_blank"
              rel="noreferrer"
              title={url}
            >
              Post {index + 1}
            </a>
          ))}
        </div>
      ) : (
        <p className="campaign-scan-account-empty">No new posts in the last 24 hours.</p>
      )}
    </article>
  );
}

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
                {progress.startDate || "-"}
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
            <p className="campaign-progress-path-value">{progress.videoDir || "-"}</p>
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
  const [progress, setProgress] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const isPending = pendingMetricKey !== null;

  useEffect(() => {
    if (schedulerError) {
      showErrorSnackbar(schedulerError);
    }
  }, [schedulerError]);

  useEffect(() => {
    if (schedulerSuccess) {
      showSuccessSnackbar(schedulerSuccess);
    }
  }, [schedulerSuccess]);

  useEffect(() => {
    if (scanError) {
      showErrorSnackbar(scanError, { autoHideDuration: 6000 });
    }
  }, [scanError]);

  useEffect(() => {
    if (!scanLoading) {
      setScanProgress(0);
      return;
    }

    setScanProgress(8);

    const intervalId = window.setInterval(() => {
      setScanProgress((current) => {
        if (current >= 92) {
          return current;
        }

        const next = current + Math.max(4, Math.round((100 - current) * 0.12));
        return Math.min(next, 92);
      });
    }, 700);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [scanLoading]);

  async function loadProgress(openModal = false) {
    setProgressLoading(true);
    setSchedulerError("");

    try {
      const response = await fetch("/api/bulk-publish");
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to load progress");
      }

      const nextProgress = payload.data;
      setProgress(nextProgress);

      if (openModal) {
        setShowProgressModal(true);
      }
    } catch (error) {
      setSchedulerError(error.message || "Failed to load progress");
    } finally {
      setProgressLoading(false);
    }
  }

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
  const supportsBulkPublish = campaign.slug !== "kick-campaign";
  const supportsKickScan = campaign.slug === "kick-campaign";

  async function runKickScan() {
    setScanLoading(true);
    setScanProgress(8);
    setScanError("");

    try {
      const response = await fetch("/api/kick-scan", {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to scan accounts");
      }

      setScanProgress(100);
      setScanResult(payload.data);
    } catch (error) {
      setScanError(error.message || "Failed to scan accounts");
    } finally {
      window.setTimeout(() => {
        setScanLoading(false);
      }, 250);
    }
  }

  async function copyScanOutput() {
    if (!scanResult?.output) {
      return;
    }

    try {
      await navigator.clipboard.writeText(scanResult.output);
    } catch {
      setScanError("Failed to copy output");
    }
  }

  async function copyScanLine(line) {
    if (!line) {
      return;
    }

    try {
      await navigator.clipboard.writeText(line);
    } catch {
      setScanError("Failed to copy output");
    }
  }

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
                onClick={() => loadProgress(true)}
              >
                {progressLoading ? "Loading..." : "View progress"}
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

      {supportsKickScan ? (
        <section className="dashboard-card campaign-scan-card">
          <div className="dashboard-card-header">
            <div>
              <p className="dashboard-section-label">Scan</p>
              <h3 className="dashboard-card-title">Recent Instagram posts</h3>
            </div>
          </div>

          <div className="campaign-scan-actions">
            <PrimaryButton
              className="dashboard-button-inline detail-action-button"
              type="button"
              onClick={runKickScan}
              disabled={scanLoading}
            >
              {scanLoading ? "Scanning..." : "Scan kick accounts"}
            </PrimaryButton>

            {scanResult?.output ? (
              <button
                type="button"
                className="campaign-scan-copy"
                onClick={copyScanOutput}
              >
                Copy output
              </button>
            ) : null}

            {scanResult?.csv ? (
              <a className="campaign-scan-copy" href="/api/kick-scan?format=csv">
                Download CSV
              </a>
            ) : null}
          </div>

          {scanLoading ? <ProgressBar percentage={scanProgress} /> : null}

          {scanError ? (
            <p className="detail-form-message detail-form-message-error">
              {scanError}
            </p>
          ) : null}

          {scanResult ? (
            <div className="campaign-scan-results">
              <div className="campaign-scan-stats">
                <div className="dashboard-stat-card">
                  <p className="dashboard-stat-label">Scanned Accounts</p>
                  <p className="dashboard-stat-value">
                    {scanResult.scannedAccounts || 0}
                  </p>
                </div>
                <div className="dashboard-stat-card">
                  <p className="dashboard-stat-label">New Posts</p>
                  <p className="dashboard-stat-value">
                    {scanResult.totalNewPosts || 0}
                  </p>
                </div>
                <div className="dashboard-stat-card">
                  <p className="dashboard-stat-label">Accounts With Hits</p>
                  <p className="dashboard-stat-value">
                    {(scanResult.accountRows || []).filter((row) => row?.urls?.length).length}
                  </p>
                </div>
              </div>

              <div className="campaign-scan-output-shell">
                <div className="campaign-scan-output-header">
                  <span className="detail-form-label">Output</span>
                  <span className="campaign-scan-output-copy">
                    {scanResult.totalNewPosts || 0} total links
                  </span>
                </div>

                <div className="campaign-scan-output-preview">
                  {scanResult.output || "No posts published in the last 24 hours."}
                </div>
              </div>

              <div className="campaign-scan-account-list">
                {(scanResult.accountRows || []).map((row) => (
                  <KickScanAccountCard
                    key={row.username}
                    row={row}
                    onCopy={copyScanLine}
                  />
                ))}
              </div>

              {Array.isArray(scanResult.errors) && scanResult.errors.length ? (
                <p className="detail-form-message detail-form-message-error">
                  Failed accounts:{" "}
                  {scanResult.errors
                    .map((entry) => entry?.username)
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {isPending ? (
        <p className="campaign-detail-hint">Opening details...</p>
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
