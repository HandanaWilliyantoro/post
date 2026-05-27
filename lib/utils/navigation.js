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

function getBrowserHref() {
  return typeof window === "undefined" ? "" : window.location.href;
}

export function preventSameRouteLinkNavigation(
  event,
  href,
  { currentPath = "", includeSearch = true } = {}
) {
  const browserHref = getBrowserHref();

  if (
    isSameRoute(currentPath, href, { includeSearch }) ||
    isSameRoute(browserHref, href, { includeSearch })
  ) {
    event?.preventDefault?.();
    return true;
  }

  return false;
}

export function isIgnorableNavigationError(error) {
  const message = String(error?.message || error || "").trim();
  const normalizedMessage = message.replace(
    /^(?:Uncaught(?: \(in promise\))? )?(?:Error: )?/,
    ""
  );

  return (
    normalizedMessage.startsWith(
      "Invariant: attempted to hard navigate to the same URL"
    ) ||
    normalizedMessage.startsWith("Abort fetching component for route:") ||
    normalizedMessage === "Cancel rendering route" ||
    normalizedMessage === "Loading initial props cancelled"
  );
}

export async function pushRouteIfChanged(router, href, options = {}) {
  const {
    includeSearch = true,
    routerOptions,
  } = options;
  const targetHref = String(href || "").trim();
  const currentBrowserPath = getBrowserHref();

  if (!targetHref || typeof router?.push !== "function") {
    return false;
  }

  if (
    isSameRoute(targetHref, router?.asPath, { includeSearch }) ||
    isSameRoute(targetHref, currentBrowserPath, { includeSearch })
  ) {
    return false;
  }

  try {
    await router.push(targetHref, undefined, routerOptions);
    return true;
  } catch (error) {
    if (isIgnorableNavigationError(error)) {
      return false;
    }

    throw error;
  }
}
