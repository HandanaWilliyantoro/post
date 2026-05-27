function stringifyDetails(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getResponseMessage(data) {
  const responseError = data?.error;

  if (responseError && typeof responseError === "object") {
    return responseError.message || responseError.code || "";
  }

  return responseError || data?.message || "";
}

export function formatErrorForLog(error, label = "Error") {
  const method = String(error?.config?.method || "").toUpperCase();
  const url =
    String(error?.config?.baseURL || "") + String(error?.config?.url || "");
  const status = error?.response?.status;
  const message =
    getResponseMessage(error?.response?.data) ||
    error?.message ||
    "Unknown error";
  const details = stringifyDetails(error?.response?.data);

  const lines = [label, `message: ${message}`];

  if (status) {
    lines.push(`status: ${status}`);
  }

  if (method || url) {
    lines.push(`request: ${[method, url].filter(Boolean).join(" ")}`.trim());
  }

  if (details && details !== message) {
    lines.push(`details: ${details}`);
  }

  return lines.join("\n");
}
