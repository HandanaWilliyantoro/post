import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import BulkPublishProgressModal from "@/components/campaignOverview/BulkPublishProgressModal";
import RecentRunsTable from "@/components/campaignOverview/RecentRunsTable";
import BulkPublishSection from "@/components/campaignOverview/BulkPublishSection";
import MetricChartCard from "@/components/campaignOverview/MetricChartCard";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";
import { addHoursToEasternDateTimeInput } from "@/lib/utils/easternTime";

const ACTIVE_BULK_PUBLISH_STATUSES = ["queued", "running", "cancelling"];
const TERMINAL_BULK_PUBLISH_STATUSES = ["completed", "failed", "cancelled"];
const RECENT_RUN_LIMIT = 25;

const metricDefinitions = [
  { key: "totalAccounts", label: "Total Number of Accounts" },
  { key: "totalPosts", label: "Total Posted Content" },
];

function sortRuns(runs) {
  return [...runs].sort((left, right) => {
    const leftTime = new Date(
      left?.createdAt || left?.queuedAt || left?.updatedAt || 0
    ).getTime();
    const rightTime = new Date(
      right?.createdAt || right?.queuedAt || right?.updatedAt || 0
    ).getTime();

    return rightTime - leftTime;
  });
}

function upsertRun(runs, nextRun) {
  if (!nextRun?.runId) {
    return runs;
  }

  return sortRuns([
    nextRun,
    ...runs.filter((run) => run.runId !== nextRun.runId),
  ]).slice(0, RECENT_RUN_LIMIT);
}

function resolveNextBulkPublishAtInput(values) {
  const publishAt = String(values?.publishAt || "").trim();

  if (!publishAt) {
    return "";
  }

  try {
    return addHoursToEasternDateTimeInput(publishAt, 2);
  } catch {
    return publishAt;
  }
}

export default function CampaignOverview({ actions, campaign }) {
  const router = useRouter();
  const [activeMetricKey, setActiveMetricKey] = useState("totalPosts");
  const [pendingMetricKey, setPendingMetricKey] = useState(null);
  const [schedulerError, setSchedulerError] = useState("");
  const [schedulerSuccess, setSchedulerSuccess] = useState("");
  const [progress, setProgress] = useState(null);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelRunId, setCancelRunId] = useState("");
  const [retryFailedLoading, setRetryFailedLoading] = useState(false);
  const [retryAllFailedLoading, setRetryAllFailedLoading] = useState(false);
  const isPending = pendingMetricKey !== null;
  const hasCurrentCampaignProgress = runs.length > 0;
  const hasActiveRuns = runs.some((run) =>
    ACTIVE_BULK_PUBLISH_STATUSES.includes(run.status)
  );
  const isSelectedRunActive = ACTIVE_BULK_PUBLISH_STATUSES.includes(
    progress?.status
  );
  const canRetryAnyFailedRuns = runs.some((run) =>
    TERMINAL_BULK_PUBLISH_STATUSES.includes(run.status) &&
    Number(run?.failedCount || 0) > 0
  );
  const retryAllFailedMessage = !runs.length
    ? ""
    : canRetryAnyFailedRuns
      ? "Retry every failed post across recent runs in one background job."
      : "No recent runs with failed posts are available to retry.";

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
    void loadProgressSummary();
  }, [campaign.slug]);

  useEffect(() => {
    if (!selectedRunId || !isSelectedRunActive) {
      return undefined;
    }

    const stream = new EventSource(
      `/api/bulk-publish-stream?runId=${encodeURIComponent(selectedRunId)}`
    );

    stream.onmessage = (event) => {
      try {
        const nextProgress = JSON.parse(event.data);

        if (!nextProgress?.runId) {
          return;
        }

        setProgress(nextProgress);
        setRuns((current) => upsertRun(current, nextProgress));

        if (["completed", "failed", "cancelled"].includes(nextProgress.status)) {
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
  }, [isSelectedRunActive, selectedRunId]);

  function openDetails(metricKey) {
    if (isPending) return;

    setActiveMetricKey(metricKey);
    setPendingMetricKey(metricKey);
    router.push({
      pathname: "/campaign-details/[slug]",
      query: { slug: campaign.slug, metric: metricKey },
    });
  }

  async function fetchRunProgress(runId) {
    const response = await fetch(
      `/api/bulk-publish?runId=${encodeURIComponent(runId)}`
    );
    const payload = await response.json();

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || "Failed to load progress");
    }

    return payload.data;
  }

  async function loadRun(runId, openModal = false) {
    setProgressLoading(true);
    setSchedulerError("");

    try {
      const nextProgress = await fetchRunProgress(runId);
      setSelectedRunId(nextProgress?.runId || "");
      setProgress(nextProgress);
      setRuns((current) => upsertRun(current, nextProgress));

      if (openModal && nextProgress?.runId) {
        setShowProgressModal(true);
      }
    } catch (error) {
      setSchedulerError(error.message || "Failed to load progress");
    } finally {
      setProgressLoading(false);
    }
  }

  async function loadProgressSummary(openModal = false, preferredRunId = "") {
    setProgressLoading(true);
    setSchedulerError("");

    try {
      const response = await fetch(
        `/api/bulk-publish?campaignSlug=${encodeURIComponent(
          campaign.slug
        )}&limit=${RECENT_RUN_LIMIT}`
      );
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to load progress");
      }

      const nextRuns = Array.isArray(payload.runs) ? payload.runs : [];
      const runIdToLoad =
        preferredRunId || selectedRunId || payload.data?.runId || "";
      let nextProgress = null;

      if (runIdToLoad) {
        try {
          nextProgress = await fetchRunProgress(runIdToLoad);
        } catch {
          nextProgress =
            nextRuns.find((run) => run.runId === runIdToLoad) ||
            (payload.data?.runId ? payload.data : null);
        }
      }

      setRuns(
        nextProgress?.runId ? upsertRun(nextRuns, nextProgress) : nextRuns
      );
      setSelectedRunId(nextProgress?.runId || "");
      setProgress(nextProgress);

      if (openModal && nextProgress?.runId) {
        setShowProgressModal(true);
      }
    } catch (error) {
      setSchedulerError(error.message || "Failed to load progress");
    } finally {
      setProgressLoading(false);
    }
  }

  async function cancelBulkPublish(runId = progress?.runId) {
    const resolvedRunId = String(runId || "").trim();

    if (!resolvedRunId) {
      return;
    }

    setCancelLoading(true);
    setCancelRunId(resolvedRunId);
    setSchedulerError("");
    setSchedulerSuccess("");

    try {
      const response = await fetch("/api/bulk-publish", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: resolvedRunId,
          campaignSlug: campaign.slug,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to cancel bulk publish");
      }

      if (resolvedRunId === String(progress?.runId || "").trim()) {
        setProgress(payload.data);
      }
      setSelectedRunId((current) =>
        current === resolvedRunId ? payload.data?.runId || current : current
      );
      setRuns((current) => upsertRun(current, payload.data));
      setSchedulerSuccess(
        payload?.message || "Bulk publish cancel requested."
      );
    } catch (error) {
      setSchedulerError(error.message || "Failed to cancel bulk publish");
    } finally {
      setCancelLoading(false);
      setCancelRunId("");
    }
  }

  async function retryFailedBulkPublish(runId = progress?.runId) {

    if (!runId) {
      return;
    }

    setRetryFailedLoading(true);
    setSchedulerError("");
    setSchedulerSuccess("");

    try {
      const response = await fetch("/api/bulk-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry-failed",
          runId,
          campaignSlug: campaign.slug,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to retry failed bulk publish posts");
      }

      const queuedRun = payload.data;
      setProgress(queuedRun);
      setSelectedRunId(queuedRun.runId || "");
      setRuns((current) => upsertRun(current, queuedRun));
      setShowProgressModal(true);
      setSchedulerSuccess(
        payload?.message || "Failed bulk publish posts queued for retry in the background."
      );
    } catch (error) {
      setSchedulerError(
        error.message || "Failed to retry failed bulk publish posts"
      );
    } finally {
      setRetryFailedLoading(false);
    }
  }

  async function retryAllFailedBulkPublish() {
    setRetryAllFailedLoading(true);
    setSchedulerError("");
    setSchedulerSuccess("");

    try {
      const response = await fetch("/api/bulk-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry-all-failed",
          campaignSlug: campaign.slug,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.error || "Failed to retry all failed bulk publish posts"
        );
      }

      const queuedRun = payload.data;
      setProgress(queuedRun);
      setSelectedRunId(queuedRun.runId || "");
      setRuns((current) => upsertRun(current, queuedRun));
      setShowProgressModal(true);
      setSchedulerSuccess(
        payload?.message || "Queued all failed bulk publish posts in the background."
      );
    } catch (error) {
      setSchedulerError(
        error.message || "Failed to retry all failed bulk publish posts"
      );
    } finally {
      setRetryAllFailedLoading(false);
    }
  }

  return (
    <section className="campaign-overview">
      <header className="campaign-top-header">
        <div>
          <h1 className="campaign-top-title">{campaign.label}</h1>
          <p className="campaign-top-description">{campaign.description}</p>
        </div>
        {actions ? <div className="campaign-top-actions">{actions}</div> : null}
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

      {campaign.slug !== "kick-campaign" ? (
        <BulkPublishSection
          assignedAccountCount={Number(campaign?.metrics?.totalAccounts?.value || 0)}
          campaignSlug={campaign.slug}
          defaultPublishAt={campaign.defaultBulkPublishAt || ""}
          error={schedulerError}
          success={schedulerSuccess}
          hasActiveRun={hasActiveRuns}
          hasProgress={hasCurrentCampaignProgress}
          progressLoading={progressLoading}
          canRetryAnyFailedRuns={canRetryAnyFailedRuns}
          retryAllFailedMessage={retryAllFailedMessage}
          retryFailedLoading={retryAllFailedLoading}
          onLoadProgress={() => loadProgressSummary(true)}
          onRetryAllFailed={retryAllFailedBulkPublish}
          onSubmit={async (values, helpers) => {
            setSchedulerError("");
            setSchedulerSuccess("");

            try {
              const response = await fetch("/api/bulk-publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  campaignSlug: campaign.slug,
                  caption: values.caption,
                  publishAt: values.publishAt,
                  publishMode: "same-time",
                  videoDir: values.videoDir,
                }),
              });
              const payload = await response.json();

              if (!response.ok || !payload?.success) {
                throw new Error(payload?.error || "Failed to start bulk publish");
              }

              const queuedRun = payload.data;
              const nextPublishAt = resolveNextBulkPublishAtInput(values);
              setProgress(queuedRun);
              setSelectedRunId(queuedRun.runId || "");
              setRuns((current) => upsertRun(current, queuedRun));
              setShowProgressModal(true);
              if (nextPublishAt) {
                helpers.setFieldValue("publishAt", nextPublishAt, false);
              }
              setSchedulerSuccess(
                hasActiveRuns
                  ? "Bulk publish added to the background queue."
                  : "Bulk publish started in the background."
              );
            } catch (error) {
              setSchedulerError(error.message || "Failed to start bulk publish");
            } finally {
              helpers.setSubmitting(false);
            }
          }}
        />
      ) : null}

      {campaign.slug !== "kick-campaign" ? (
        <RecentRunsTable
          runs={runs}
          selectedRunId={selectedRunId}
          cancelRunId={cancelRunId}
          cancelLoading={cancelLoading}
          retryFailedLoading={retryFailedLoading || retryAllFailedLoading}
          onCancelRun={(runId) => cancelBulkPublish(runId)}
          onRetryRun={(runId) => retryFailedBulkPublish(runId)}
          onViewRun={(runId) => loadRun(runId, true)}
        />
      ) : null}

      <p className="campaign-detail-hint">
        {isPending
          ? "Opening details..."
          : "Tip: Click a chart card to drill into the underlying accounts or posts."}
      </p>

      {campaign.slug !== "kick-campaign" && showProgressModal && progress?.runId ? (
        <BulkPublishProgressModal
          progress={progress}
          cancelLoading={cancelLoading && cancelRunId === progress.runId}
          retryFailedLoading={retryFailedLoading}
          onCancel={() => cancelBulkPublish(progress.runId)}
          onRetryFailed={retryFailedBulkPublish}
          onClose={() => setShowProgressModal(false)}
        />
      ) : null}
    </section>
  );
}
