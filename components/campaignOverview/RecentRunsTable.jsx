import PrimaryButton from "@/components/PrimaryButton";
import StatusPill from "@/components/campaignDetails/StatusPill";
import { formatEasternDateTime } from "@/lib/utils/easternTime";

function formatRunLabel(run) {
  const runId = String(run?.runId || "").trim();

  if (!runId) {
    return "-";
  }

  return runId.slice(0, 8);
}

function isRetryableRun(run) {
  return (
    !["queued", "running", "cancelling"].includes(String(run?.status || "").trim()) &&
    Number(run?.failedCount || 0) > 0
  );
}

function isCancelableRun(run) {
  return ["queued", "running", "cancelling"].includes(
    String(run?.status || "").trim()
  );
}

export default function RecentRunsTable({
  runs = [],
  selectedRunId = "",
  cancelRunId = "",
  cancelLoading = false,
  retryFailedLoading = false,
  onCancelRun,
  onRetryRun,
  onViewRun,
}) {
  if (!runs.length) {
    return null;
  }

  return (
    <section className="dashboard-card campaign-runs-card">
      <div className="dashboard-card-header">
        <div>
          <p className="dashboard-section-label">Bulk Publish History</p>
          <h3 className="dashboard-card-title">Recent runs</h3>
        </div>
      </div>

      <section className="detail-table-card campaign-runs-table-card">
        <table className="detail-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Publish at</th>
              <th>Status</th>
              <th>Processed</th>
              <th>Completed</th>
              <th>Failed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const isSelected = run.runId === selectedRunId;
              const canRetryRun = isRetryableRun(run);
              const canCancelRun = isCancelableRun(run);
              const isCancelingRun =
                cancelLoading && cancelRunId === String(run?.runId || "").trim();
              const retryLabel = "Retry failed";

              return (
                <tr
                  key={run.runId}
                  className={isSelected ? "campaign-run-row-selected" : ""}
                >
                  <td data-label="Run">
                    <div className="detail-post-main">
                      <span className="detail-strong">
                        {isSelected ? "Selected" : "Run"} {formatRunLabel(run)}
                      </span>
                      <span className="detail-post-subtle">
                        {run.retrySourceRunId ? "Retry queue" : "Original queue"}
                      </span>
                    </div>
                  </td>
                  <td data-label="Publish at">{formatEasternDateTime(run.publishAt || run.createdAt || run.queuedAt)}</td>
                  <td data-label="Status"><StatusPill value={run.status || "idle"} /></td>
                  <td data-label="Processed">{run.processedCount || 0} / {run.totalCount || 0}</td>
                  <td data-label="Completed">{run.completedCount || 0}</td>
                  <td data-label="Failed">{run.failedCount || 0}</td>
                  <td data-label="Actions">
                    <div className="detail-row-actions">
                      <button
                        type="button"
                        className="detail-row-edit-button"
                        onClick={() => onViewRun?.(run.runId)}
                      >
                        View
                      </button>
                      {canCancelRun ? (
                        <PrimaryButton
                          type="button"
                          className="dashboard-button-inline detail-action-button campaign-progress-cancel"
                          variant="ghost"
                          onClick={() => onCancelRun?.(run.runId)}
                          disabled={isCancelingRun || run.status === "cancelling"}
                        >
                          {isCancelingRun || run.status === "cancelling"
                            ? "Canceling..."
                            : "Cancel"}
                        </PrimaryButton>
                      ) : null}
                      <PrimaryButton
                        type="button"
                        className="dashboard-button-inline campaign-run-retry-button"
                        variant="ghost"
                        onClick={() => onRetryRun?.(run.runId)}
                        disabled={!canRetryRun || retryFailedLoading}
                      >
                        {retryFailedLoading ? "Queueing..." : retryLabel}
                      </PrimaryButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </section>
  );
}
