export const DEFAULT_PAGE_SIZE = 10;

export default function PaginationControls({
  endItem,
  onNext,
  onPrevious,
  page,
  pageCount,
  pageSize,
  startItem,
  totalItems,
}) {
  if (totalItems <= pageSize) return null;

  return (
    <div className="detail-pagination">
      <p className="detail-pagination-copy">
        Showing {startItem}-{endItem} of {totalItems}
      </p>
      <div className="detail-pagination-actions">
        <button type="button" className="detail-pagination-button" onClick={onPrevious} disabled={page <= 1}>
          Previous
        </button>
        <span className="detail-pagination-page">
          Page {page} of {pageCount}
        </span>
        <button type="button" className="detail-pagination-button" onClick={onNext} disabled={page >= pageCount}>
          Next
        </button>
      </div>
    </div>
  );
}
