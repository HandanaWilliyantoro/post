export default function DetailControls({
  filteredCount,
  isAccountsView,
  queryText,
  statusFilter,
  totalCount,
  onQueryChange,
  onStatusFilterChange,
}) {
  return (
    <section className="detail-controls">
      <label className="detail-search">
        <span className="sr-only">Search</span>
        <input value={queryText} onChange={(event) => onQueryChange(event.target.value)} className="detail-search-input" placeholder={isAccountsView ? "Search accounts…" : "Search posts…"} />
      </label>

      <p className="detail-showing">
        Showing <span className="detail-showing-strong">{filteredCount}</span> of <span className="detail-showing-strong">{totalCount}</span>
      </p>

      {!isAccountsView ? (
        <label className="detail-filter">
          <span className="detail-filter-label">Status</span>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} className="detail-filter-select">
            <option value="all">All</option><option value="queuedLike">Queued + scheduled</option><option value="queued">Queued</option><option value="scheduled">Scheduled</option><option value="processing">Processing</option><option value="partial">Partial</option><option value="published">Published</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option>
          </select>
        </label>
      ) : null}
    </section>
  );
}
