import axios from "axios";

import config from "@/config";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";

function normalizeBaseUrl(value) {
  return String(value || "https://api.postforme.dev/v1")
    .trim()
    .replace(/\/+$/, "");
}

function getResponseErrorMessage(error) {
  const data = error?.response?.data;

  if (typeof data === "string") {
    return data.trim();
  }

  if (Array.isArray(data?.message)) {
    return data.message
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ");
  }

  if (data?.error && typeof data.error === "object") {
    return String(data.error.message || data.error.code || "").trim();
  }

  return String(data?.message || data?.error || "").trim();
}

const postformeClient = axios.create({
  baseURL: normalizeBaseUrl(config.postforme.baseUrl),
  proxy: false,
  timeout: 45000,
  headers: {
    "Content-Type": "application/json",
  },
});

postformeClient.interceptors.request.use((request) => {
  const apiKey = String(config.postforme.apiKey || "").trim();

  if (!apiKey) {
    throw new Error("POSTFORME_API_KEY is not configured");
  }

  request.headers.Authorization = `Bearer ${apiKey}`;
  return request;
});

postformeClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const responseMessage = getResponseErrorMessage(error);

    if (responseMessage) {
      error.message = `PostForMe: ${responseMessage}`;
    }

    if (!error?.config?.suppressErrorLog) {
      console.error(formatErrorForLog(error, "[PostForMe API Error]"));
    }
    return Promise.reject(error);
  }
);

export default postformeClient;
