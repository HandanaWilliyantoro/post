import PrimaryButton from "@/components/PrimaryButton";
import StatusPill from "@/components/campaignDetails/StatusPill";
import { formatEasternDateTime } from "@/lib/utils/easternTime";

function getModeLabel(mode) {
  return mode === "stagger-2h" ? "Every 2 Hours" : "Same Time";
}

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

export default function RecentRunsTable({
  runs = [],
  selectedRunId = "",
  retryFailedLoading = false,
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
              <th>Queued at</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Processed</th>
              <th>Scheduled</th>
              <th>Failed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const isSelected = run.runId === selectedRunId;
              const canRetryRun = isRetryableRun(run);

              return (
                <tr
                  key={run.runId}
                  className={isSelected ? "campaign-run-row-selected" : ""}
                >
                  <td>
                    <div className="detail-post-main">
                      <span className="detail-strong">
                        {isSelected ? "Selected" : "Run"} {formatRunLabel(run)}
                      </span>
                      <span className="detail-post-subtle">
                        {run.retrySourceRunId ? "Retry queue" : "Original queue"}
                      </span>
                    </div>
                  </td>
                  <td>{formatEasternDateTime(run.createdAt || run.queuedAt)}</td>
                  <td><StatusPill value={run.status || "idle"} /></td>
                  <td>{getModeLabel(run.publishMode)}</td>
                  <td>{run.processedCount || 0} / {run.totalCount || 0}</td>
                  <td>{run.completedCount || 0}</td>
                  <td>{run.failedCount || 0}</td>
                  <td>
                    <div className="detail-row-actions">
                      <button
                        type="button"
                        className="detail-row-edit-button"
                        onClick={() => onViewRun?.(run.runId)}
                      >
                        View
                      </button>
                      <PrimaryButton
                        type="button"
                        className="dashboard-button-inline campaign-run-retry-button"
                        variant="ghost"
                        onClick={() => onRetryRun?.(run.runId)}
                        disabled={!canRetryRun || retryFailedLoading}
                      >
                        {retryFailedLoading ? "Queueing..." : "Retry failed"}
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
