import CampaignOverview from "@/components/CampaignOverview";
import DeleteCampaignButton from "@/components/campaign/DeleteCampaignButton";
import Layout from "@/components/Layout";
import { getAccounts } from "@/lib/accounts/getAccounts";
import { findCampaignBySlug } from "@/lib/campaigns";
import { listAllPosts } from "@/lib/post";

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

  const accounts = await getAccounts({ campaignSlug: campaign.slug });
  const totalAccounts = accounts.length;
  const posts = await listAllPosts({ campaignSlug: campaign.slug });

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
            value: posts.length,
            trend: buildCountTrend(
              posts.length,
              campaign.metrics.totalPosts.trend.length
            ),
          },
        },
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
