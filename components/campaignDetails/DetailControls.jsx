export default function DetailControls({
  filteredCount,
  isAccountsView,
  queryText,
  totalCount,
  onQueryChange,
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
    </section>
  );
}
