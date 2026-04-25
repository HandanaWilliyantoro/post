import {
  normalizeCampaignType,
  normalizeText,
} from "@/lib/campaignNormalization";

export function normalizeCampaignCredentials(input = {}) {
  return {
    campaignType: normalizeCampaignType(input?.campaignType),
    campaignId: normalizeText(input?.campaignId),
    campaignPassword: normalizeText(input?.campaignPassword),
  };
}

export function assertCampaignCredentials(input = {}, label = "Campaign") {
  const metadata = normalizeCampaignCredentials(input);

  if (metadata.campaignType === "auto-scan") {
    if (!metadata.campaignId) {
      throw new Error(`${label} campaignId is required for auto-scan campaigns`);
    }

    if (!metadata.campaignPassword) {
      throw new Error(
        `${label} campaignPassword is required for auto-scan campaigns`
      );
    }
  }

  return metadata;
}

export function buildCampaignFields(input = {}) {
  const metadata = assertCampaignCredentials(input);

  if (metadata.campaignType === "manual") {
    return {
      campaignType: "manual",
      campaignId: "",
      campaignPassword: "",
    };
  }

  return metadata;
}
