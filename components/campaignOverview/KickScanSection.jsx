import PrimaryButton from "@/components/PrimaryButton";
import ProgressBar from "@/components/ProgressBar";
import KickScanAccountCard from "@/components/campaignOverview/KickScanAccountCard";

export default function KickScanSection({
  error,
  result,
  scanLoading,
  scanProgress,
  onCopyOutput,
  onCopyLine,
  onRunScan,
}) {
  return (
    <section className="dashboard-card campaign-scan-card">
      <div className="dashboard-card-header">
        <div>
          <p className="dashboard-section-label">Scan</p>
          <h3 className="dashboard-card-title">Recent Instagram posts</h3>
        </div>
      </div>

      <div className="campaign-scan-actions">
        <PrimaryButton className="dashboard-button-inline detail-action-button" type="button" onClick={onRunScan} disabled={scanLoading}>
          {scanLoading ? "Scanning..." : "Scan kick accounts"}
        </PrimaryButton>
        {result?.output ? <button type="button" className="campaign-scan-copy" onClick={onCopyOutput}>Copy output</button> : null}
        {result?.csv ? <a className="campaign-scan-copy" href="/api/kick-scan?format=csv">Download CSV</a> : null}
      </div>

      {scanLoading ? <ProgressBar percentage={scanProgress} /> : null}
      {error ? <p className="detail-form-message detail-form-message-error">{error}</p> : null}

      {result ? (
        <div className="campaign-scan-results">
          <div className="campaign-scan-stats">
            <div className="dashboard-stat-card"><p className="dashboard-stat-label">Scanned Accounts</p><p className="dashboard-stat-value">{result.scannedAccounts || 0}</p></div>
            <div className="dashboard-stat-card"><p className="dashboard-stat-label">New Posts</p><p className="dashboard-stat-value">{result.totalNewPosts || 0}</p></div>
            <div className="dashboard-stat-card"><p className="dashboard-stat-label">Accounts With Hits</p><p className="dashboard-stat-value">{(result.accountRows || []).filter((row) => row?.urls?.length).length}</p></div>
          </div>

          <div className="campaign-scan-output-shell">
            <div className="campaign-scan-output-header">
              <span className="detail-form-label">Output</span>
              <span className="campaign-scan-output-copy">{result.totalNewPosts || 0} total links</span>
            </div>
            <div className="campaign-scan-output-preview">{result.output || "No posts published in the last 24 hours."}</div>
          </div>

          <div className="campaign-scan-account-list">
            {(result.accountRows || []).map((row) => <KickScanAccountCard key={row.username} row={row} onCopy={onCopyLine} />)}
          </div>

          {Array.isArray(result.errors) && result.errors.length ? (
            <p className="detail-form-message detail-form-message-error">
              Failed accounts: {result.errors.map((entry) => entry?.username).filter(Boolean).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
