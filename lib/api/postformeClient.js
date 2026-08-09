import axios from "axios";

import config from "@/config";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";

// https://www.postforme.dev/resources/understanding-api-rate-limits
const POSTFORME_MAX_REQUESTS_PER_SECOND = Math.max(
  1,
  Number(process.env.POSTFORME_MAX_RPS || 5) || 5
);
const POSTFORME_MAX_REQUESTS_PER_MINUTE = Math.max(
  1,
  Number(process.env.POSTFORME_MAX_RPM || 40) || 40
);
const POSTFORME_CLIENT_MAX_RETRIES = Math.max(
  0,
  Number(process.env.POSTFORME_CLIENT_MAX_RETRIES || 8) || 8
);
const POSTFORME_CLIENT_RETRY_BASE_DELAY_MS = Math.max(
  250,
  Number(process.env.POSTFORME_CLIENT_RETRY_BASE_DELAY_MS || 1000) || 1000
);
const POSTFORME_CLIENT_RETRY_MAX_DELAY_MS = Math.max(
  POSTFORME_CLIENT_RETRY_BASE_DELAY_MS,
  Number(process.env.POSTFORME_CLIENT_RETRY_MAX_DELAY_MS || 60_000) || 60_000
);

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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function parseRetryAfterMs(error) {
  const header =
    error?.response?.headers?.["retry-after"] ??
    error?.response?.headers?.["Retry-After"];

  if (header == null || header === "") {
    return null;
  }

  const asSeconds = Number(header);

  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.ceil(asSeconds * 1000);
  }

  const asDate = Date.parse(String(header));

  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return null;
}

function getClientRetryDelayMs(error, attempt) {
  const retryAfterMs = parseRetryAfterMs(error);

  if (retryAfterMs != null) {
    return Math.min(
      POSTFORME_CLIENT_RETRY_MAX_DELAY_MS,
      Math.max(250, retryAfterMs)
    );
  }

  const exponent = Math.max(0, Number(attempt || 1) - 1);
  const jitter = Math.floor(Math.random() * 250);

  return Math.min(
    POSTFORME_CLIENT_RETRY_MAX_DELAY_MS,
    POSTFORME_CLIENT_RETRY_BASE_DELAY_MS * 2 ** exponent + jitter
  );
}

function isRetryableClientError(error) {
  if (!error) {
    return false;
  }

  const status = Number(error?.response?.status || 0);
  const code = String(error?.code || "").trim().toUpperCase();
  const method = String(error?.config?.method || "get")
    .trim()
    .toLowerCase();
  const idempotentMethods = new Set(["get", "head", "options"]);

  if (status === 429 || status === 408 || status === 425) {
    return true;
  }

  if (status >= 500 && status <= 599) {
    return true;
  }

  if (
    [
      "ECONNABORTED",
      "ECONNRESET",
      "EAI_AGAIN",
      "ETIMEDOUT",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "EPIPE",
      "ERR_NETWORK",
    ].includes(code)
  ) {
    return true;
  }

  // Avoid blind retries on non-idempotent 4xx that aren't rate limits.
  if (status >= 400 && status < 500) {
    return false;
  }

  // Network failures with no response: retry safe methods always; mutating too
  // for bulk reliability (create post may need bulk-level dedupe).
  if (!error.response) {
    return true;
  }

  return idempotentMethods.has(method);
}

class PostForMeRateLimiter {
  constructor({
    maxPerSecond = POSTFORME_MAX_REQUESTS_PER_SECOND,
    maxPerMinute = POSTFORME_MAX_REQUESTS_PER_MINUTE,
  } = {}) {
    this.maxPerSecond = maxPerSecond;
    this.maxPerMinute = maxPerMinute;
    this.secondHits = [];
    this.minuteHits = [];
    this.chain = Promise.resolve();
  }

  prune(now) {
    this.secondHits = this.secondHits.filter((ts) => now - ts < 1000);
    this.minuteHits = this.minuteHits.filter((ts) => now - ts < 60_000);
  }

  async acquire() {
    const run = async () => {
      for (;;) {
        const now = Date.now();
        this.prune(now);

        if (
          this.secondHits.length < this.maxPerSecond &&
          this.minuteHits.length < this.maxPerMinute
        ) {
          this.secondHits.push(now);
          this.minuteHits.push(now);
          return;
        }

        const secondWait =
          this.secondHits.length >= this.maxPerSecond
            ? 1000 - (now - this.secondHits[0]) + 10
            : 0;
        const minuteWait =
          this.minuteHits.length >= this.maxPerMinute
            ? 60_000 - (now - this.minuteHits[0]) + 10
            : 0;

        await sleep(Math.max(secondWait, minuteWait, 25));
      }
    };

    const next = this.chain.then(run, run);
    this.chain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

const rateLimiter = new PostForMeRateLimiter();

const postformeClient = axios.create({
  baseURL: normalizeBaseUrl(config.postforme.baseUrl),
  proxy: false,
  timeout: 45000,
  headers: {
    "Content-Type": "application/json",
  },
});

postformeClient.interceptors.request.use(async (request) => {
  const apiKey = String(config.postforme.apiKey || "").trim();

  if (!apiKey) {
    throw new Error("POSTFORME_API_KEY is not configured");
  }

  request.headers.Authorization = `Bearer ${apiKey}`;

  if (!request.skipRateLimit) {
    await rateLimiter.acquire();
  }

  return request;
});

postformeClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const responseMessage = getResponseErrorMessage(error);
    const configRequest = error?.config || {};
    const retryCount = Math.max(0, Number(configRequest.__retryCount || 0) || 0);
    const retryAfterMs = parseRetryAfterMs(error);

    if (retryAfterMs != null) {
      error.retryAfterMs = retryAfterMs;
    }

    if (responseMessage) {
      error.message = `PostForMe: ${responseMessage}`;
    }

    const shouldRetry =
      !configRequest.skipRetry &&
      isRetryableClientError(error) &&
      retryCount < POSTFORME_CLIENT_MAX_RETRIES;

    if (shouldRetry) {
      const nextAttempt = retryCount + 1;
      const delayMs = getClientRetryDelayMs(error, nextAttempt);
      configRequest.__retryCount = nextAttempt;

      if (!configRequest.suppressErrorLog) {
        console.warn(
          `[PostForMe] retry ${nextAttempt}/${POSTFORME_CLIENT_MAX_RETRIES} after ${delayMs}ms: ${error.message}`
        );
      }

      await sleep(delayMs);
      return postformeClient.request(configRequest);
    }

    if (!configRequest.suppressErrorLog) {
      console.error(formatErrorForLog(error, "[PostForMe API Error]"));
    }

    return Promise.reject(error);
  }
);

export {
  POSTFORME_MAX_REQUESTS_PER_MINUTE,
  POSTFORME_MAX_REQUESTS_PER_SECOND,
  parseRetryAfterMs,
};

export default postformeClient;
