import {
  normalizeCampaignType,
} from "@/lib/campaignNormalization";

export function normalizeCampaignCredentials(input = {}) {
  const hasExplicitCampaignType = Object.prototype.hasOwnProperty.call(
    input,
    "campaignType"
  );

  return {
    campaignType: hasExplicitCampaignType
      ? normalizeCampaignType(input?.campaignType)
      : "manual",
    campaignId: "",
    campaignPassword: "",
  };
}

export function assertCampaignCredentials(input = {}) {
  return normalizeCampaignCredentials(input);
}

export function buildCampaignFields(input = {}) {
  return assertCampaignCredentials(input);
}
