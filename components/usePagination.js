import { useEffect, useMemo, useState } from "react";

import { DEFAULT_PAGE_SIZE } from "@/components/PaginationControls";

export default function usePagination(items, pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalItems = items.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setPage(1);
  }, [items, pageSize]);

  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedItems = useMemo(
    () => items.slice(startIndex, startIndex + pageSize),
    [items, pageSize, startIndex]
  );

  return {
    endItem: totalItems ? Math.min(startIndex + pageSize, totalItems) : 0,
    page: safePage,
    pageCount,
    pageSize,
    paginatedItems,
    setNextPage: () => setPage((current) => Math.min(current + 1, pageCount)),
    setPreviousPage: () => setPage((current) => Math.max(current - 1, 1)),
    startItem: totalItems ? startIndex + 1 : 0,
    totalItems,
  };
}
