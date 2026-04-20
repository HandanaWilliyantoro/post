import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import BulkPublishProgressModal from "@/components/campaignOverview/BulkPublishProgressModal";
import BulkPublishSection from "@/components/campaignOverview/BulkPublishSection";
import KickScanSection from "@/components/campaignOverview/KickScanSection";
import MetricChartCard from "@/components/campaignOverview/MetricChartCard";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";

const metricDefinitions = [
  { key: "totalAccounts", label: "Total Number of Accounts" },
  { key: "totalPosts", label: "Total Posted Content" },
  { key: "queuedPosts", label: "Total Queued Content" },
];

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
  const isCurrentCampaignRunning = progress?.campaignSlug === campaign.slug && ["queued", "running"].includes(progress?.status);
  const isAnyJobActive = ["queued", "running"].includes(progress?.status);

  useEffect(() => { if (schedulerError) showErrorSnackbar(schedulerError); }, [schedulerError]);
  useEffect(() => { if (schedulerSuccess) showSuccessSnackbar(schedulerSuccess); }, [schedulerSuccess]);
  useEffect(() => { if (scanError) showErrorSnackbar(scanError, { autoHideDuration: 6000 }); }, [scanError]);
  useEffect(() => {
    if (!scanLoading) return void setScanProgress(0);
    setScanProgress(8);
    const intervalId = window.setInterval(() => setScanProgress((current) => current >= 92 ? current : Math.min(current + Math.max(4, Math.round((100 - current) * 0.12)), 92)), 700);
    return () => window.clearInterval(intervalId);
  }, [scanLoading]);

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

  async function runKickScan() {
    setScanLoading(true);
    setScanProgress(8);
    setScanError("");
    try {
      const response = await fetch("/api/kick-scan", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to scan accounts");
      setScanProgress(100);
      setScanResult(payload.data);
    } catch (error) {
      setScanError(error.message || "Failed to scan accounts");
    } finally {
      window.setTimeout(() => setScanLoading(false), 250);
    }
  }

  async function copyText(value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setScanError("Failed to copy output");
    }
  }

  return (
    <section className="campaign-overview">
      <header className="campaign-top-header"><h1 className="campaign-top-title">{campaign.label}</h1><p className="campaign-top-description">{campaign.description}</p></header>
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
          isRunning={isCurrentCampaignRunning}
          progressLoading={progressLoading}
          onLoadProgress={() => loadProgress(true)}
          onSubmit={async (values, helpers) => {
            setSchedulerError("");
            setSchedulerSuccess("");
            try {
              const response = await fetch("/api/bulk-publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignSlug: campaign.slug, startDate: values.startDate, videoDir: values.videoDir }) });
              const payload = await response.json();
              if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to start bulk publish");
              setSchedulerSuccess("Bulk publish started in the background.");
              setProgress((current) => ({ ...(current || {}), campaignSlug: campaign.slug, startDate: values.startDate, videoDir: values.videoDir, status: "queued", percentage: 0, completedCount: 0, totalCount: 0 }));
              setShowProgressModal(true);
            } catch (error) {
              setSchedulerError(error.message || "Failed to start bulk publish");
            } finally {
              helpers.setSubmitting(false);
            }
          }}
        />
      ) : null}

      {campaign.slug === "kick-campaign" ? <KickScanSection error={scanError} result={scanResult} scanLoading={scanLoading} scanProgress={scanProgress} onCopyOutput={() => copyText(scanResult?.output)} onCopyLine={copyText} onRunScan={runKickScan} /> : null}
      <p className="campaign-detail-hint">{isPending ? "Opening details..." : "Tip: Click a chart card to drill into the underlying accounts or posts."}</p>
      {campaign.slug !== "kick-campaign" && showProgressModal && isCurrentCampaignRunning ? <BulkPublishProgressModal progress={progress} onClose={() => setShowProgressModal(false)} /> : null}
    </section>
  );
}
