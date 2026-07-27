import Layout from "@/components/Layout";
import { getCampaignRoutes } from "@/lib/campaigns";

export async function getServerSideProps() {
  const campaignRoutes = await getCampaignRoutes();
  const destination = campaignRoutes[0]?.href;

  if (!destination) {
    return {
      props: {},
    };
  }

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
}

export default function Home() {
  return (
    <Layout title="Campaign Dashboard">
      <div className="detail-shell">
        <header className="detail-header">
          <div className="detail-header-left">
            <p className="dashboard-section-label">Campaigns</p>
            <h1 className="detail-title">No campaigns yet</h1>
            <p className="campaign-top-description">
              Create a campaign to start assigning accounts and scheduling posts.
            </p>
          </div>
        </header>
      </div>
    </Layout>
  );
}
