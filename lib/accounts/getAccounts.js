import { getCampaignAccounts } from "@/lib/accounts/campaignAccounts";
import {
  fetchAllAccounts,
  filterEligibleAccounts,
  serializeAccounts,
} from "@/lib/accounts/fetchAccounts";

const ACCOUNTS_CACHE_TTL_MS = 30 * 1000;
const DEFAULT_CAMPAIGN_SLUG = "lospollostv-campaign";

let accountsCache = new Map();

export async function getAccounts(options = {}) {
  const hasExplicitCampaignSlug = Object.prototype.hasOwnProperty.call(
    options,
    "campaignSlug"
  );
  const campaignSlug = options.campaignSlug || DEFAULT_CAMPAIGN_SLUG;
  const cachedEntry = accountsCache.get(campaignSlug);

  if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
    return cachedEntry.value;
  }

  let accounts;

  try {
    accounts = await getCampaignAccounts(campaignSlug);
  } catch (error) {
    if (campaignSlug === DEFAULT_CAMPAIGN_SLUG) {
      throw error;
    }

    accounts = [];
  }

  if (!accounts.length && !hasExplicitCampaignSlug) {
    const rawAccounts = await fetchAllAccounts();
    accounts = serializeAccounts(filterEligibleAccounts(rawAccounts));
  }

  accountsCache.set(campaignSlug, {
    value: accounts,
    expiresAt: Date.now() + ACCOUNTS_CACHE_TTL_MS,
  });

  return accounts;
}

export function clearAccountsCache() {
  accountsCache = new Map();
}
