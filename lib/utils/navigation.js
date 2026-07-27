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

function normalizeQueryValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(",");
  }

  if (value == null) {
    return "";
  }

  return String(value);
}

function areQueriesEqual(left = {}, right = {}) {
  const leftEntries = Object.entries(left)
    .map(([key, value]) => [key, normalizeQueryValue(value)])
    .filter(([, value]) => value !== "")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const rightEntries = Object.entries(right)
    .map(([key, value]) => [key, normalizeQueryValue(value)])
    .filter(([, value]) => value !== "")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(
    ([key, value], index) =>
      key === rightEntries[index][0] && value === rightEntries[index][1]
  );
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

async function runRouteChange(router, method, href, as, routerOptions) {
  try {
    await router[method](href, as, routerOptions);
    return true;
  } catch (error) {
    if (isIgnorableNavigationError(error)) {
      return false;
    }

    throw error;
  }
}

function isSameTargetRoute(router, href, as, { includeSearch = true } = {}) {
  const currentBrowserPath = getBrowserHref();

  if (typeof as === "string" && as.trim()) {
    return (
      isSameRoute(as, router?.asPath, { includeSearch }) ||
      isSameRoute(as, currentBrowserPath, { includeSearch })
    );
  }

  if (typeof href === "string") {
    const targetHref = href.trim();

    return (
      Boolean(targetHref) &&
      (isSameRoute(targetHref, router?.asPath, { includeSearch }) ||
        isSameRoute(targetHref, currentBrowserPath, { includeSearch }))
    );
  }

  if (href && typeof href === "object") {
    const pathname = String(href.pathname || router?.pathname || "").trim();
    const currentPathname = String(router?.pathname || "").trim();

    if (pathname && currentPathname && pathname !== currentPathname) {
      return false;
    }

    return areQueriesEqual(href.query || {}, router?.query || {});
  }

  return false;
}

export async function pushRouteIfChanged(router, href, options = {}) {
  const {
    includeSearch = true,
    routerOptions,
  } = options;
  const targetHref = String(href || "").trim();

  if (!targetHref || typeof router?.push !== "function") {
    return false;
  }

  if (isSameTargetRoute(router, targetHref, undefined, { includeSearch })) {
    return false;
  }

  return runRouteChange(router, "push", targetHref, undefined, routerOptions);
}

export async function replaceRouteIfChanged(router, href, options = {}) {
  const {
    includeSearch = true,
    routerOptions,
    as,
  } = options;
  const targetHref =
    href && typeof href === "object" ? href : String(href || "").trim();

  if (!targetHref || typeof router?.replace !== "function") {
    return false;
  }

  if (isSameTargetRoute(router, targetHref, as, { includeSearch })) {
    return false;
  }

  return runRouteChange(router, "replace", targetHref, as, routerOptions);
}

export async function refreshCurrentRoute(router, options = {}) {
  const { scroll = false } = options;

  if (typeof router?.reload === "function") {
    router.reload();
    return true;
  }

  if (typeof router?.replace !== "function") {
    return false;
  }

  const pathname = router.pathname;
  const asPath = String(router.asPath || "").trim() || "/";
  const query = { ...(router.query || {}) };

  delete query.__refresh;

  return runRouteChange(
    router,
    "replace",
    {
      pathname,
      query: {
        ...query,
        __refresh: String(Date.now()),
      },
    },
    asPath,
    { scroll }
  );
}
