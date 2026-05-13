import postonceClient from "@/lib/api/postonceClient";
import {
  isSupportedSeedAccountPlatform,
  normalizeAccountPlatform,
} from "@/lib/accounts/platforms";
import { ACTIVE_ACCOUNT_STATUS } from "@/lib/accounts/status";

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

export async function fetchAllAccounts() {
  return postonceClient.get("/accounts");
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
