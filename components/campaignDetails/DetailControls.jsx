import { POST_PUBLISH_HOUR_FILTER_OPTIONS } from "@/lib/post/publishHourFilters";
import { POST_STATUS_FILTER_OPTIONS } from "@/lib/post/statusFilters";

export default function DetailControls({
  filteredCount,
  isAccountsView,
  publishDate,
  publishHour,
  queryText,
  statusFilter,
  totalCount,
  onPublishDateChange,
  onPublishHourChange,
  onQueryChange,
  onStatusFilterChange,
}) {
  return (
    <section className="detail-controls">
      <div className="detail-controls-main">
        {isAccountsView ? (
          <label className="detail-search">
            <span className="sr-only">Search</span>
            <input
              value={queryText}
              onChange={(event) => onQueryChange(event.target.value)}
              className="detail-search-input"
              placeholder="Search accounts..."
            />
          </label>
        ) : (
          <div className="detail-date-filters">
            <label className="detail-date-filter">
              <span className="detail-date-filter-label">Post on</span>
              <input
                type="date"
                value={publishDate}
                onChange={(event) => onPublishDateChange(event.target.value)}
                className="detail-date-input"
              />
            </label>

            <label className="detail-date-filter">
              <span className="detail-date-filter-label">Hour</span>
              <select
                value={
                  publishHour === null || publishHour === undefined
                    ? ""
                    : String(publishHour)
                }
                onChange={(event) => onPublishHourChange?.(event.target.value)}
                className="detail-filter-select"
              >
                {POST_PUBLISH_HOUR_FILTER_OPTIONS.map((option) => (
                  <option key={option.value || "all-hours"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="detail-date-filter">
              <span className="detail-date-filter-label">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => onStatusFilterChange(event.target.value)}
                className="detail-filter-select"
              >
                {POST_STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <p className="detail-showing">
        Showing <span className="detail-showing-strong">{filteredCount}</span> of{" "}
        <span className="detail-showing-strong">{totalCount}</span>
      </p>
    </section>
  );
}
