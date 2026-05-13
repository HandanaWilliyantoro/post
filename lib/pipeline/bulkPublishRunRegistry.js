const activeBulkPublishRuns = new Map();

export function createBulkPublishAbortError() {
  const error = new Error("Bulk publish cancelled");
  error.name = "AbortError";
  error.code = "ERR_CANCELED";
  return error;
}

export function registerBulkPublishRun(runId) {
  const normalizedRunId = String(runId || "").trim();
  const controller = new AbortController();

  if (normalizedRunId) {
    activeBulkPublishRuns.set(normalizedRunId, controller);
  }

  return controller;
}

export function cancelBulkPublishRun(runId) {
  const normalizedRunId = String(runId || "").trim();
  const controller = activeBulkPublishRuns.get(normalizedRunId);

  if (!controller) {
    return false;
  }

  controller.abort(createBulkPublishAbortError());
  return true;
}

export function hasActiveBulkPublishRun(runId) {
  const normalizedRunId = String(runId || "").trim();

  if (!normalizedRunId) {
    return false;
  }

  return activeBulkPublishRuns.has(normalizedRunId);
}

export function clearBulkPublishRun(runId) {
  const normalizedRunId = String(runId || "").trim();

  if (!normalizedRunId) {
    return;
  }

  activeBulkPublishRuns.delete(normalizedRunId);
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
