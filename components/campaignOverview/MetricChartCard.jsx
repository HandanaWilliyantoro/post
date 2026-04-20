import { memo } from "react";

function MetricChartCard({ label, value, active, loading, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`campaign-chart-card ${active ? "campaign-chart-card-active" : ""} ${loading ? "campaign-chart-card-loading" : ""}`}
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
}

export default memo(MetricChartCard);
