import { createHash } from "crypto";

export const ACCOUNT_ORDER_FOLDER = "folder-order";
export const ACCOUNT_ORDER_SHUFFLE = "shuffle";

function normalizeCampaignSlugForOrder(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeAccountOrderMode(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (["shuffle", "shuffled", "random", "randomize"].includes(normalizedValue)) {
    return ACCOUNT_ORDER_SHUFFLE;
  }

  return ACCOUNT_ORDER_FOLDER;
}

export function isKickCampaignForAccountOrder(campaignSlug) {
  const normalizedSlug = normalizeCampaignSlugForOrder(campaignSlug);

  return normalizedSlug === "kick" || normalizedSlug === "kick-campaign";
}

export function resolveAccountOrderModeForCampaign(campaignSlug, value) {
  if (isKickCampaignForAccountOrder(campaignSlug)) {
    return ACCOUNT_ORDER_SHUFFLE;
  }

  return normalizeAccountOrderMode(value);
}

function getDeterministicSwapIndex(seed, index) {
  const hash = createHash("sha256")
    .update(`${seed}:${index}`)
    .digest();

  return hash.readUInt32BE(0) % (index + 1);
}

function hasSameOrder(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function shuffleItemsWithSeed(items, seed) {
  const list = Array.isArray(items) ? [...items] : [];
  const normalizedSeed = String(seed || "").trim();

  if (list.length <= 1 || !normalizedSeed) {
    return list;
  }

  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = getDeterministicSwapIndex(normalizedSeed, index);
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }

  if (hasSameOrder(list, items)) {
    list.push(list.shift());
  }

  return list;
}
