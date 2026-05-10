const activeBulkPublishRuns = new Map();

export function createBulkPublishAbortError() {
  const error = new Error("Bulk publish cancelled");
  error.name = "AbortError";
  error.code = "ERR_CANCELED";
  return error;
}

export function registerBulkPublishRun(campaignSlug) {
  const normalizedSlug = String(campaignSlug || "").trim();
  const controller = new AbortController();

  if (normalizedSlug) {
    activeBulkPublishRuns.set(normalizedSlug, controller);
  }

  return controller;
}

export function cancelBulkPublishRun(campaignSlug) {
  const normalizedSlug = String(campaignSlug || "").trim();
  const controller = activeBulkPublishRuns.get(normalizedSlug);

  if (!controller) {
    return false;
  }

  controller.abort(createBulkPublishAbortError());
  return true;
}

export function hasActiveBulkPublishRun(campaignSlug) {
  const normalizedSlug = String(campaignSlug || "").trim();

  if (!normalizedSlug) {
    return false;
  }

  return activeBulkPublishRuns.has(normalizedSlug);
}

export function clearBulkPublishRun(campaignSlug) {
  const normalizedSlug = String(campaignSlug || "").trim();

  if (!normalizedSlug) {
    return;
  }

  activeBulkPublishRuns.delete(normalizedSlug);
}

export function isBulkPublishAbortError(error) {
  return (
    error?.name === "AbortError" ||
    error?.name === "CanceledError" ||
    error?.code === "ERR_CANCELED" ||
    error?.message === "Bulk publish cancelled"
  );
}

export function throwIfBulkPublishAborted(signal) {
  if (!signal?.aborted) {
    return;
  }

  const reason = signal.reason;

  if (reason instanceof Error) {
    throw reason;
  }

  throw createBulkPublishAbortError();
}
