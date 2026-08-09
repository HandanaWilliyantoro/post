import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import BulkPublishProgressModal from "@/components/campaignOverview/BulkPublishProgressModal";
import RecentRunsTable from "@/components/campaignOverview/RecentRunsTable";
import BulkPublishSection from "@/components/campaignOverview/BulkPublishSection";
import MetricChartCard from "@/components/campaignOverview/MetricChartCard";
import {
  getCampaignPostIntervalHours,
  resolveDefaultCampaignPublishAt,
  snapPublishAtToScheduleSlot,
} from "@/lib/post/schedule";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";
import {
  easternDateTimeInputToIso,
  isoToEasternDateTimeInput,
} from "@/lib/utils/easternTime";
import { pushRouteIfChanged } from "@/lib/utils/navigation";

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

function resolveNextBulkPublishAtInput(publishAtValue, campaign) {
  const publishAt = String(publishAtValue || "").trim();

  if (!publishAt) {
    return "";
  }

  try {
    const baseIso =
      publishAt.includes("T") && /Z$|[+-]\d{2}:\d{2}$/.test(publishAt)
        ? publishAt
        : easternDateTimeInputToIso(publishAt);
    const snappedIso = snapPublishAtToScheduleSlot(baseIso, campaign);
    // Next default = 2h after this campaign run's publish slot (same campaign only)
    const nextIso = resolveDefaultCampaignPublishAt({
      campaignSlug: campaign,
      lastPublishAt: snappedIso,
    });

    return isoToEasternDateTimeInput(nextIso) || publishAt;
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
  const assignedAccountCount = Math.max(
    0,
    Number(campaign?.metrics?.totalAccounts?.value || 0) || 0
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

  function belongsToCurrentCampaign(run) {
    const runCampaign = String(run?.campaignSlug || "").trim();
    const current = String(campaign?.slug || "").trim();

    return Boolean(runCampaign && current && runCampaign === current);
  }

  function filterCampaignRuns(runsList = []) {
    return (Array.isArray(runsList) ? runsList : []).filter(belongsToCurrentCampaign);
  }

  useEffect(() => {
    // Clear other campaigns' runs immediately when switching
    setRuns([]);
    setProgress(null);
    setSelectedRunId("");
    setShowProgressModal(false);
    void loadProgressSummary();
  }, [campaign.slug]);

  useEffect(() => {
    if (!selectedRunId || !isSelectedRunActive) {
      return undefined;
    }

    const stream = new EventSource(
      `/api/bulk-publish-stream?runId=${encodeURIComponent(selectedRunId)}&campaignSlug=${encodeURIComponent(campaign.slug)}`
    );

    stream.onmessage = (event) => {
      try {
        const nextProgress = JSON.parse(event.data);

        if (!nextProgress?.runId || !belongsToCurrentCampaign(nextProgress)) {
          return;
        }

        setProgress(nextProgress);
        setRuns((current) =>
          filterCampaignRuns(upsertRun(current, nextProgress))
        );

        if (["completed", "failed", "cancelled"].includes(nextProgress.status)) {
          stream.close();
        }
      } catch {
        // Ignore malformed keep-alive payloads.
      }
    };

    return () => {
      stream.close();
    };
  }, [campaign.slug, isSelectedRunActive, selectedRunId]);

  function openDetails(metricKey) {
    if (isPending) return;

    setActiveMetricKey(metricKey);
    setPendingMetricKey(metricKey);
    void pushRouteIfChanged(
      router,
      `/campaign-details/${encodeURIComponent(campaign.slug)}?metric=${encodeURIComponent(metricKey)}`
    );
  }

  async function fetchRunProgress(runId) {
    const response = await fetch(
      `/api/bulk-publish?runId=${encodeURIComponent(runId)}&campaignSlug=${encodeURIComponent(campaign.slug)}`
    );
    const payload = await response.json();

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || "Failed to load progress");
    }

    if (!belongsToCurrentCampaign(payload.data)) {
      throw new Error("Bulk publish run belongs to a different campaign");
    }

    return payload.data;
  }

  async function loadRun(runId, openModal = false) {
    setProgressLoading(true);
    setSchedulerError("");

    try {
      const nextProgress = await fetchRunProgress(runId);

      if (!belongsToCurrentCampaign(nextProgress)) {
        return;
      }

      setSelectedRunId(nextProgress?.runId || "");
      setProgress(nextProgress);
      setRuns((current) =>
        filterCampaignRuns(upsertRun(current, nextProgress))
      );

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

      const nextRuns = filterCampaignRuns(
        Array.isArray(payload.runs) ? payload.runs : []
      );
      const preferred = String(preferredRunId || "").trim();
      const runIdToLoad =
        (preferred && nextRuns.some((run) => run.runId === preferred)
          ? preferred
          : "") ||
        (payload.data?.runId && belongsToCurrentCampaign(payload.data)
          ? payload.data.runId
          : "") ||
        nextRuns[0]?.runId ||
        "";
      let nextProgress = null;

      if (runIdToLoad) {
        try {
          nextProgress = await fetchRunProgress(runIdToLoad);
        } catch {
          nextProgress =
            nextRuns.find((run) => run.runId === runIdToLoad) ||
            (belongsToCurrentCampaign(payload.data) ? payload.data : null);
        }
      }

      if (nextProgress && !belongsToCurrentCampaign(nextProgress)) {
        nextProgress = null;
      }

      setRuns(
        nextProgress?.runId
          ? filterCampaignRuns(upsertRun(nextRuns, nextProgress))
          : nextRuns
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

      <BulkPublishSection
          assignedAccountCount={assignedAccountCount}
          campaignSlug={campaign.slug}
          campaignIntervalHours={getCampaignPostIntervalHours(campaign)}
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
                  publishMode: values.publishMode || "same-time",
                  videoDir: values.videoDir,
                }),
              });
              const payload = await response.json();

              if (!response.ok || !payload?.success) {
                throw new Error(payload?.error || "Failed to start bulk publish");
              }

              const queuedRun = payload.data;
              // Advance from the server-snapped 2h slot, not raw form input
              const nextPublishAt = resolveNextBulkPublishAtInput(
                queuedRun?.publishAt || values.publishAt,
                campaign
              );
              setProgress(queuedRun);
              setSelectedRunId(queuedRun.runId || "");
              setRuns((current) => upsertRun(current, queuedRun));
              setShowProgressModal(true);
              if (nextPublishAt) {
                helpers.setFieldValue("publishAt", nextPublishAt, false);
                helpers.setFieldTouched("publishAt", false, false);
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

      <p className="campaign-detail-hint">
        {isPending
          ? "Opening details..."
          : "Tip: Click a chart card to drill into the underlying accounts or posts."}
      </p>

      {showProgressModal && progress?.runId ? (
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
