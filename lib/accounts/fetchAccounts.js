import postformeClient from "@/lib/api/postformeClient";
import {
  isSupportedSeedAccountPlatform,
  normalizeAccountPlatform,
} from "@/lib/accounts/platforms";
import { ACTIVE_ACCOUNT_STATUS } from "@/lib/accounts/status";

const POSTFORME_CONNECTED_STATUS = "connected";
const DEFAULT_POSTFORME_PAGE_SIZE = 100;

function normalizeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeValue(nestedValue),
      ])
    );
  }

  return value;
}

export function serializeAccounts(accounts) {
  return accounts.map((account) => normalizeValue(account));
}

function normalizeProviderStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePostForMeAccount(account = {}) {
  const providerStatus = normalizeProviderStatus(account.status);

  return serializeAccounts([{
    id: String(account.id || "").trim(),
    username: String(account.username || account.user_id || "").trim(),
    platform: normalizeAccountPlatform(account.platform, ""),
    user_id: String(account.user_id || "").trim(),
    external_id: String(account.external_id || "").trim(),
    avatar_url: String(account.profile_photo_url || "").trim(),
    profile_photo_url: String(account.profile_photo_url || "").trim(),
    provider: "postforme",
    providerStatus,
    status:
      providerStatus === POSTFORME_CONNECTED_STATUS
        ? ACTIVE_ACCOUNT_STATUS
        : providerStatus || "disconnected",
    metadata:
      account.metadata && typeof account.metadata === "object"
        ? account.metadata
        : {},
  }])[0];
}

export async function fetchAllAccounts(options = {}) {
  const limit = Math.max(
    1,
    Math.min(500, Number(options.limit || DEFAULT_POSTFORME_PAGE_SIZE) || DEFAULT_POSTFORME_PAGE_SIZE)
  );
  const accounts = [];
  let offset = Math.max(0, Number(options.offset || 0) || 0);

  for (let page = 0; page < 100; page += 1) {
    const response = await postformeClient.get("/social-accounts", {
      params: { limit, offset },
      signal: options.signal,
    });
    const items = Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response)
        ? response
        : [];

    accounts.push(...items.map(normalizePostForMeAccount));

    if (!items.length || !response?.meta?.next) {
      break;
    }

    offset += items.length || limit;
  }

  return accounts;
}

export function filterEligibleAccounts(accounts) {
  return accounts.flatMap((account) => {
    if (!isSupportedSeedAccountPlatform(account?.platform)) return [];
    if (account?.status !== ACTIVE_ACCOUNT_STATUS) {
      return [];
    }

    return [{
      ...account,
      platform: normalizeAccountPlatform(account?.platform),
    }];
  });
}
