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

export function formatErrorForLog(error, label = "Error") {
  const method = String(error?.config?.method || "").toUpperCase();
  const url =
    String(error?.config?.baseURL || "") + String(error?.config?.url || "");
  const status = error?.response?.status;
  const message =
    error?.response?.data?.error ||
    error?.response?.data?.message ||
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
