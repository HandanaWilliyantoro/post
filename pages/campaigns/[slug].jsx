import CampaignOverview from "@/components/CampaignOverview";
import CleanupCampaignButton from "@/components/campaign/CleanupCampaignButton";
import DeleteCampaignButton from "@/components/campaign/DeleteCampaignButton";
import RenameCampaignButton from "@/components/campaign/RenameCampaignButton";
import Layout from "@/components/Layout";
import { getAccounts } from "@/lib/accounts/getAccounts";
import { findCampaignBySlug } from "@/lib/campaigns";
import { listAllPosts } from "@/lib/post";
import {
  getCampaignPostIntervalHours,
  resolveDefaultCampaignPublishAt,
} from "@/lib/post/schedule";
import { isoToEasternDateTimeInput } from "@/lib/utils/easternTime";

function resolveRouteSlug(context = {}) {
  return String(context?.params?.slug || context?.query?.slug || "").trim();
}

function buildCountTrend(count, points) {
  if (count <= 0) {
    return Array.from({ length: points }, () => 0);
  }

  return Array.from({ length: points }, (_, index) => {
    return Math.max(1, Math.round((count * (index + 1)) / points));
  });
}

export async function getServerSideProps(context) {
  const campaign = await findCampaignBySlug(resolveRouteSlug(context));

  if (!campaign) {
    return {
      notFound: true,
    };
  }

  const [accounts, posts] = await Promise.all([
    getAccounts({ campaignSlug: campaign.slug }),
    listAllPosts({ campaignSlug: campaign.slug }),
  ]);
  const totalAccounts = accounts.length;
  const livePosts = posts.filter(
    (post) =>
      post?.localOnly !== true &&
      !["failed", "cancelled"].includes(String(post?.status || "").toLowerCase())
  );
  // Default publish_at = 2h after last post on THIS campaign only (from 7am ET)
  const nextBulkPublishAt = resolveDefaultCampaignPublishAt({
    campaignSlug: campaign.slug,
    existingPosts: livePosts,
  });

  return {
    props: {
      campaign: {
        ...campaign,
        metrics: {
          ...campaign.metrics,
          totalAccounts: {
            ...campaign.metrics.totalAccounts,
            value: totalAccounts,
            trend: buildCountTrend(
              totalAccounts,
              campaign.metrics.totalAccounts.trend.length
            ),
          },
          totalPosts: {
            ...campaign.metrics.totalPosts,
            value: livePosts.length,
            trend: buildCountTrend(
              livePosts.length,
              campaign.metrics.totalPosts.trend.length
            ),
          },
        },
        defaultBulkPublishAt: isoToEasternDateTimeInput(nextBulkPublishAt),
      },
    },
  };
}

export default function CampaignPage({ campaign }) {
  return (
    <Layout title={campaign.label}>
      <CampaignOverview
        campaign={campaign}
        actions={
          <>
            <RenameCampaignButton campaign={campaign} />
            <CleanupCampaignButton campaign={campaign} />
            <DeleteCampaignButton campaign={campaign} />
          </>
        }
      />
    </Layout>
  );
}
