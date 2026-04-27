import { findCampaignBySlug } from "@/lib/campaigns";
import { getAccounts } from "@/lib/accounts/getAccounts";
import { scheduleVideoPosts } from "@/lib/pipeline/scheduleVideoPosts";

export async function publishVideo({
  file,
  accountIds,
  accounts,
  content,
  publishAt,
  campaignSlug,
  sourceFilePath,
  origin,
}) {
  const campaign = await findCampaignBySlug(campaignSlug);

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const resolvedAccounts = Array.isArray(accounts) && accounts.length
    ? accounts
    : await getAccounts({ campaignSlug });
  const filteredAccounts = Array.isArray(accountIds) && accountIds.length
    ? resolvedAccounts.filter((account) => accountIds.includes(account.id))
    : resolvedAccounts;

  const { posts } = await scheduleVideoPosts({
    campaign,
    accounts: filteredAccounts,
    content,
    publishAt,
    sourceFile: file,
    sourceFilePath,
    origin,
  });

  console.log("[pipeline/publishVideo] scheduled:", publishAt);

  return posts;
}
