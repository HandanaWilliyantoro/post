export default function KickScanAccountCard({ row, onCopy }) {
  const urls = Array.isArray(row?.urls) ? row.urls : [];

  return (
    <article className="campaign-scan-account-card">
      <div className="campaign-scan-account-top">
        <div>
          <p className="campaign-scan-account-name">{row?.username || "Unknown"}</p>
          <p className="campaign-scan-account-meta">{urls.length} new post{urls.length === 1 ? "" : "s"}</p>
        </div>

        <button type="button" className="campaign-scan-account-copy" onClick={() => onCopy(row?.line || "")} disabled={!row?.line}>
          Copy line
        </button>
      </div>

      {urls.length ? (
        <div className="campaign-scan-link-grid">
          {urls.map((url, index) => (
            <a key={`${row?.username || "account"}-${index}`} className="campaign-scan-link-chip" href={url} target="_blank" rel="noreferrer" title={url}>
              Post {index + 1}
            </a>
          ))}
        </div>
      ) : (
        <p className="campaign-scan-account-empty">No new posts in the last 24 hours.</p>
      )}
    </article>
  );
}
