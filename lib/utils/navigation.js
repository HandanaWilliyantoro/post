function toComparableRoute(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized, "http://localhost");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return normalized;
  }
}

export function normalizeRouteForComparison(
  value,
  { includeSearch = true } = {}
) {
  const comparable = toComparableRoute(value).split("#")[0];
  const [pathnamePart, searchPart = ""] = comparable.split("?");
  const pathname =
    pathnamePart && pathnamePart !== "/"
      ? pathnamePart.replace(/\/+$/, "")
      : pathnamePart || "/";

  if (!includeSearch || !searchPart) {
    return pathname;
  }

  return `${pathname}?${searchPart}`;
}

export function isSameRoute(left, right, options) {
  return (
    normalizeRouteForComparison(left, options) ===
    normalizeRouteForComparison(right, options)
  );
}

export function isIgnorableNavigationError(error) {
  const message = String(error?.message || error || "").trim();

  return (
    message.startsWith(
      "Invariant: attempted to hard navigate to the same URL"
    ) ||
    message.startsWith("Abort fetching component for route:") ||
    message === "Cancel rendering route" ||
    message === "Loading initial props cancelled"
  );
}
