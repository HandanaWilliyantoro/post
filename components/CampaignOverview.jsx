import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import BulkPublishProgressModal from "@/components/campaignOverview/BulkPublishProgressModal";
import BulkPublishSection from "@/components/campaignOverview/BulkPublishSection";
import MetricChartCard from "@/components/campaignOverview/MetricChartCard";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";
import { easternDateTimeInputToIso } from "@/lib/utils/easternTime";

const ACTIVE_BULK_PUBLISH_STATUSES = ["queued", "running", "cancelling"];

const metricDefinitions = [
  { key: "totalAccounts", label: "Total Number of Accounts" },
  { key: "totalPosts", label: "Total Posted Content" },
];

export default function CampaignOverview({ actions, campaign }) {
  const router = useRouter();
  const [activeMetricKey, setActiveMetricKey] = useState("totalPosts");
  const [pendingMetricKey, setPendingMetricKey] = useState(null);
  const [schedulerError, setSchedulerError] = useState("");
  const [schedulerSuccess, setSchedulerSuccess] = useState("");
  const [progress, setProgress] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const isPending = pendingMetricKey !== null;
  const hasCurrentCampaignProgress = progress?.campaignSlug === campaign.slug && progress?.status && progress.status !== "idle";
  const isCurrentCampaignRunning = progress?.campaignSlug === campaign.slug && ACTIVE_BULK_PUBLISH_STATUSES.includes(progress?.status);
  const isOtherCampaignRunning = progress?.campaignSlug !== campaign.slug && ACTIVE_BULK_PUBLISH_STATUSES.includes(progress?.status);
  const isAnyJobActive = ACTIVE_BULK_PUBLISH_STATUSES.includes(progress?.status);

  useEffect(() => { if (schedulerError) showErrorSnackbar(schedulerError); }, [schedulerError]);
  useEffect(() => { if (schedulerSuccess) showSuccessSnackbar(schedulerSuccess); }, [schedulerSuccess]);
  useEffect(() => {
    loadProgress();
  }, []);
  useEffect(() => {
    if (!isCurrentCampaignRunning) {
      return undefined;
    }

    const stream = new EventSource(`/api/bulk-publish-stream?campaignSlug=${encodeURIComponent(campaign.slug)}`);

    stream.onmessage = (event) => {
      try {
        const nextProgress = JSON.parse(event.data);
        setProgress(nextProgress);

        if (["completed", "failed", "cancelled"].includes(nextProgress?.status)) {
          stream.close();
        }
      } catch {
        // Ignore malformed keep-alive payloads.
      }
    };

    stream.onerror = () => {
      stream.close();
    };

    return () => {
      stream.close();
    };
  }, [campaign.slug, isCurrentCampaignRunning]);

  function openDetails(metricKey) {
    if (isPending) return;
    setActiveMetricKey(metricKey);
    setPendingMetricKey(metricKey);
    router.push({ pathname: "/campaign-details/[slug]", query: { slug: campaign.slug, metric: metricKey } });
  }

  async function loadProgress(openModal = false) {
    setProgressLoading(true);
    setSchedulerError("");
    try {
      const response = await fetch("/api/bulk-publish");
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to load progress");
      setProgress(payload.data);
      if (openModal) setShowProgressModal(true);
    } catch (error) {
      setSchedulerError(error.message || "Failed to load progress");
    } finally {
      setProgressLoading(false);
    }
  }

  async function cancelBulkPublish() {
    setCancelLoading(true);
    setSchedulerError("");
    setSchedulerSuccess("");

    try {
      const response = await fetch("/api/bulk-publish", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignSlug: campaign.slug }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to cancel bulk publish");
      }

      setProgress(payload.data);
      setSchedulerSuccess("Bulk publish cancel requested.");
    } catch (error) {
      setSchedulerError(error.message || "Failed to cancel bulk publish");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <section className="campaign-overview">
      <header className="campaign-top-header"><div><h1 className="campaign-top-title">{campaign.label}</h1><p className="campaign-top-description">{campaign.description}</p><p className="campaign-detail-hint">Type: {campaign.campaignType || "manual"}{campaign.campaignType === "auto-scan" && campaign.campaignId ? ` | Campaign ID: ${campaign.campaignId}` : ""}</p></div>{actions ? <div className="campaign-top-actions">{actions}</div> : null}</header>
      <div className="campaign-charts-grid">
        {metricDefinitions.map((metric) => <MetricChartCard key={metric.key} label={metric.label} value={campaign.metrics[metric.key].value} active={activeMetricKey === metric.key} loading={pendingMetricKey === metric.key && isPending} disabled={isPending} onClick={() => openDetails(metric.key)} />)}
        {isPending ? <div className="campaign-grid-loading"><span className="campaign-grid-loading-spinner" /><p className="campaign-grid-loading-title">Loading detail view</p><p className="campaign-grid-loading-copy">Pulling the selected campaign data into the table.</p></div> : null}
      </div>

      {campaign.slug !== "kick-campaign" ? (
        <BulkPublishSection
          campaignSlug={campaign.slug}
          disabled={isAnyJobActive}
          error={schedulerError}
          success={schedulerSuccess}
          hasProgress={hasCurrentCampaignProgress}
          isRunning={isCurrentCampaignRunning}
          isBlockedByOtherCampaign={isOtherCampaignRunning}
          activeCampaignSlug={isAnyJobActive ? progress?.campaignSlug : ""}
          progressLoading={progressLoading}
          onLoadProgress={() => loadProgress(true)}
          onSubmit={async (values, helpers) => {
            setSchedulerError("");
            setSchedulerSuccess("");
            try {
              const publishAtIso = easternDateTimeInputToIso(values.publishAt);
              const response = await fetch("/api/bulk-publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignSlug: campaign.slug, caption: values.caption, publishAt: values.publishAt, publishMode: values.publishMode, videoDir: values.videoDir }) });
              const payload = await response.json();
              if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to start bulk publish");
              setSchedulerSuccess("Bulk publish started in the background.");
              setProgress((current) => ({ ...(current || {}), campaignSlug: campaign.slug, caption: values.caption, publishAt: publishAtIso, publishMode: values.publishMode, videoDir: values.videoDir, status: "queued", percentage: 0, completedCount: 0, processedCount: 0, failedCount: 0, totalCount: 0, totalFiles: 0, matchedCount: 0, skippedVideoCount: 0, missingAccountCount: 0 }));
              setShowProgressModal(true);
            } catch (error) {
              setSchedulerError(error.message || "Failed to start bulk publish");
            } finally {
              helpers.setSubmitting(false);
            }
          }}
        />
      ) : null}

      <p className="campaign-detail-hint">{isPending ? "Opening details..." : "Tip: Click a chart card to drill into the underlying accounts or posts."}</p>
      {campaign.slug !== "kick-campaign" && showProgressModal && hasCurrentCampaignProgress ? (
        <BulkPublishProgressModal
          progress={progress}
          cancelLoading={cancelLoading}
          onCancel={cancelBulkPublish}
          onClose={() => setShowProgressModal(false)}
        />
      ) : null}
    </section>
  );
}
