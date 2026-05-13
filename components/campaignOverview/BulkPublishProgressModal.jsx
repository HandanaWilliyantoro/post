import ModalShell from "@/components/campaignDetails/ModalShell";
import PrimaryButton from "@/components/PrimaryButton";
import ProgressBar from "@/components/ProgressBar";
import { formatEasternDateTime } from "@/lib/utils/easternTime";

export default function BulkPublishProgressModal({
  progress,
  cancelLoading = false,
  retryFailedLoading = false,
  onCancel,
  onRetryFailed,
  onClose,
}) {
  if (!progress) return null;
  const isStaggeredMode = progress.publishMode === "stagger-2h";
  const isCancelable = ["queued", "running"].includes(progress.status);
  const canRetryFailed =
    !isCancelable &&
    progress.status !== "cancelling" &&
    Number(progress?.failedCount || 0) > 0;
  const retryPendingCount = Number(progress?.retryPendingCount || 0);
  const progressCopy = progress.status === "queued"
    ? "This run is queued in the background. It will start automatically after earlier bulk publish work finishes."
    : retryPendingCount > 0
      ? "The job is auto-retrying failed posts in the background until every post is scheduled or you cancel the run."
    : isStaggeredMode
      ? "The job is scanning the folder, ignoring filenames, rotating videos across assigned campaign accounts in order, and creating PostOnce posts in the background."
      : "The job is scanning the folder, matching filenames to assigned account usernames, and creating PostOnce posts in the background.";
  const fileCountLabel = isStaggeredMode ? "Assigned Files" : "Matched Files";
  const accountCountLabel = isStaggeredMode ? "Unused Accounts" : "Missing Accounts";
  const accountSamplesLabel = isStaggeredMode
    ? "Unused Account Samples"
    : "Missing Account Samples";

  return (
    <ModalShell
      title="Bulk Publish Progress"
      onClose={onClose}
      modalClassName="campaign-progress-modal"
    >
      <div className="campaign-progress-body">
        <div className="campaign-progress-topline">
          <span className="dashboard-section-label">Campaign</span>
          <span className="dashboard-badge dashboard-badge-accent">{progress.status || "running"}</span>
        </div>
        <p className="campaign-progress-copy">{progressCopy}</p>
        <ProgressBar percentage={progress.percentage || 0} />

        <div className="campaign-progress-stats">
          <div className="dashboard-stat-card">
            <p className="dashboard-stat-label">Mode</p>
            <p className="dashboard-stat-value">{isStaggeredMode ? "Every 2 Hours" : "Same Time"}</p>
          </div>
          <div className="dashboard-stat-card">
            <p className="dashboard-stat-label">Processed</p>
            <p className="dashboard-stat-value">{progress.processedCount || 0} / {progress.totalCount || 0}</p>
          </div>
          <div className="dashboard-stat-card">
            <p className="dashboard-stat-label">Scheduled</p>
            <p className="dashboard-stat-value">{progress.completedCount || 0}</p>
          </div>
          <div className="dashboard-stat-card">
            <p className="dashboard-stat-label">Failed</p>
            <p className="dashboard-stat-value">{progress.failedCount || 0}</p>
          </div>
          <div className="dashboard-stat-card">
            <p className="dashboard-stat-label">Retry Attempts</p>
            <p className="dashboard-stat-value">{progress.retryAttemptCount || 0}</p>
          </div>
          <div className="dashboard-stat-card">
            <p className="dashboard-stat-label">{fileCountLabel}</p>
            <p className="dashboard-stat-value">{progress.matchedCount || 0} / {progress.totalFiles || 0}</p>
          </div>
          <div className="dashboard-stat-card">
            <p className="dashboard-stat-label">Skipped Files</p>
            <p className="dashboard-stat-value">{progress.skippedVideoCount || 0}</p>
          </div>
          <div className="dashboard-stat-card">
            <p className="dashboard-stat-label">{accountCountLabel}</p>
            <p className="dashboard-stat-value">{progress.missingAccountCount || 0}</p>
          </div>
        </div>

        <div className="campaign-progress-path">
          <p className="dashboard-stat-label">Folder Path</p>
          <p className="campaign-progress-path-value">{progress.videoDir || "-"}</p>
        </div>

        {progress.caption ? (
          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">Caption</p>
            <p className="campaign-progress-path-value">{progress.caption}</p>
          </div>
        ) : null}

        {progress.publishAt ? (
          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">{isStaggeredMode ? "First Publish At" : "Publish At"}</p>
            <p className="campaign-progress-path-value">{formatEasternDateTime(progress.publishAt)}</p>
          </div>
        ) : null}

        {progress.nextRetryAt ? (
          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">Next Retry At</p>
            <p className="campaign-progress-path-value">{formatEasternDateTime(progress.nextRetryAt)}</p>
          </div>
        ) : null}

        {progress.createdAt || progress.queuedAt ? (
          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">Queued At</p>
            <p className="campaign-progress-path-value">{formatEasternDateTime(progress.createdAt || progress.queuedAt)}</p>
          </div>
        ) : null}

        {progress.lastProcessedVideo || progress.lastProcessedUsername ? (
          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">Last Processed</p>
            <p className="campaign-progress-path-value">{progress.lastProcessedVideo || "-"}{progress.lastProcessedUsername ? ` -> ${progress.lastProcessedUsername}` : ""}</p>
          </div>
        ) : null}

        {Array.isArray(progress.skippedVideoSamples) && progress.skippedVideoSamples.length ? (
          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">Skipped Samples</p>
            <div className="campaign-progress-path-value">
              {progress.skippedVideoSamples.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        ) : null}

        {Array.isArray(progress.missingAccountSamples) && progress.missingAccountSamples.length ? (
          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">{accountSamplesLabel}</p>
            <div className="campaign-progress-path-value">
              {progress.missingAccountSamples.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        ) : null}

        {Array.isArray(progress.failedJobSamples) && progress.failedJobSamples.length ? (
          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">Failed Samples</p>
            <div className="campaign-progress-path-value">
              {progress.failedJobSamples.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        ) : null}

        {progress.lastError ? <p className="detail-form-message detail-form-message-error">{progress.lastError}</p> : null}
        {progress.error ? <p className="detail-form-message detail-form-message-error">{progress.error}</p> : null}

        {isCancelable || progress.status === "cancelling" || canRetryFailed ? (
          <div className="campaign-progress-actions">
            <PrimaryButton
              type="button"
              variant="ghost"
              className="dashboard-button-inline"
              onClick={onClose}
            >
              Close
            </PrimaryButton>
            {isCancelable || progress.status === "cancelling" ? (
              <PrimaryButton
                type="button"
                className="dashboard-button-inline detail-action-button campaign-progress-cancel"
                onClick={onCancel}
                disabled={cancelLoading || !isCancelable}
              >
                {cancelLoading || progress.status === "cancelling"
                  ? "Canceling..."
                  : "Cancel bulk publish"}
              </PrimaryButton>
            ) : null}
            {canRetryFailed ? (
              <PrimaryButton
                type="button"
                className="dashboard-button-inline detail-action-button"
                onClick={onRetryFailed}
                disabled={retryFailedLoading}
              >
                {retryFailedLoading ? "Queueing failed posts..." : "Retry failed posts"}
              </PrimaryButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
