import axios from "axios";
import config from "@/config";

const { baseUrl, apiKey } = config.postonce;

/**
 * Axios instance for PostOnce API
 */
const postonceClient = axios.create({
  baseURL: baseUrl,
  proxy: false,
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
});

/**
 * 🔹 Response interceptor
 * Automatically unwraps:
 * res.data.data → res.data
 */
postonceClient.interceptors.response.use(
  (response) => {
    // If API returns { data: ... }
    if (
      response?.data &&
      typeof response.data === "object" &&
      "data" in response.data
    ) {
      return response.data.data;
    }

    // fallback (if API doesn't wrap)
    return response.data;
  },
  (error) => {
    // 🔥 Normalize error
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error.message ||
      "Unknown API error";

    console.error("❌ PostOnce API Error:", message);

    return Promise.reject(error);
  }
);

export default postonceClient;
