import CampaignOverview from "@/components/CampaignOverview";
import DeleteCampaignButton from "@/components/campaign/DeleteCampaignButton";
import Layout from "@/components/Layout";
import { getAccounts } from "@/lib/accounts/getAccounts";
import { findCampaignBySlug } from "@/lib/campaigns";
import { listAllPosts } from "@/lib/post";
import { getLatestCampaignPublishAt } from "@/lib/post/queries/listPosts";
import { getDefaultBulkPublishDateTimeInput } from "@/lib/utils/easternTime";

function buildCountTrend(count, points) {
  if (count <= 0) {
    return Array.from({ length: points }, () => 0);
  }

  return Array.from({ length: points }, (_, index) => {
    return Math.max(1, Math.round((count * (index + 1)) / points));
  });
}

export async function getServerSideProps({ params }) {
  const campaign = await findCampaignBySlug(params?.slug);

  if (!campaign) {
    return {
      notFound: true,
    };
  }

  const [accounts, posts, latestPublishAt] = await Promise.all([
    getAccounts({ campaignSlug: campaign.slug }),
    listAllPosts({ campaignSlug: campaign.slug }),
    getLatestCampaignPublishAt(campaign.slug),
  ]);
  const totalAccounts = accounts.length;
  const livePosts = posts.filter((post) => post?.localOnly !== true);

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
        defaultBulkPublishAt: getDefaultBulkPublishDateTimeInput(
          latestPublishAt,
          2
        ),
      },
    },
  };
}

export default function CampaignPage({ campaign }) {
  return (
    <Layout title={campaign.label}>
      <CampaignOverview campaign={campaign} actions={<DeleteCampaignButton campaign={campaign} />} />
    </Layout>
  );
}
