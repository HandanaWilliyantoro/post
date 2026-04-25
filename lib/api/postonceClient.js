import axios from "axios";
import config from "@/config";
import { formatErrorForLog } from "@/lib/utils/formatErrorForLog";

const { baseUrl, apiKey } = config.postonce;

const postonceClient = axios.create({
  baseURL: baseUrl,
  proxy: false,
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
});

postonceClient.interceptors.response.use(
  (response) => {
    if (
      response?.data &&
      typeof response.data === "object" &&
      "data" in response.data
    ) {
      return response.data.data;
    }

    return response.data;
  },
  (error) => {
    console.error(formatErrorForLog(error, "[PostOnce API Error]"));
    return Promise.reject(error);
  }
);

export default postonceClient;
