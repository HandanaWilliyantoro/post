import postonceClient from "@/lib/api/postonceClient";

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
  return accounts.filter((account) => {
    if (account.platform !== "instagram") return false;
    if (account.status !== "active") return false;
    return true;
  });
}
