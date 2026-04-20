import ProgressBar from "@/components/ProgressBar";

export default function BulkPublishProgressModal({ progress, onClose }) {
  if (!progress) return null;

  return (
    <div className="detail-modal-overlay" role="dialog" aria-modal="true">
      <div className="detail-modal campaign-progress-modal">
        <div className="detail-modal-header">
          <h3 className="detail-modal-title">Bulk Publish Progress</h3>
          <button type="button" className="detail-icon-button" onClick={onClose} aria-label="Close progress dialog">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="detail-modal-body campaign-progress-body">
          <div className="campaign-progress-topline">
            <span className="dashboard-section-label">Campaign</span>
            <span className="dashboard-badge dashboard-badge-accent">{progress.status || "running"}</span>
          </div>
          <p className="campaign-progress-copy">Background scheduling is active for this campaign. You can keep using other campaign pages while this continues.</p>
          <ProgressBar percentage={progress.percentage || 0} />

          <div className="campaign-progress-stats">
            <div className="dashboard-stat-card">
              <p className="dashboard-stat-label">Start Date</p>
              <p className="dashboard-stat-value">{progress.startDate || "-"}</p>
            </div>
            <div className="dashboard-stat-card">
              <p className="dashboard-stat-label">Completed</p>
              <p className="dashboard-stat-value">{progress.completedCount || 0} / {progress.totalCount || 0}</p>
            </div>
          </div>

          <div className="campaign-progress-path">
            <p className="dashboard-stat-label">Folder Path</p>
            <p className="campaign-progress-path-value">{progress.videoDir || "-"}</p>
          </div>

          {progress.error ? <p className="detail-form-message detail-form-message-error">{progress.error}</p> : null}
        </div>
      </div>
    </div>
  );
}
