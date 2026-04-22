import { getCampaignRoutes } from "@/lib/campaigns";

export async function getServerSideProps() {
  const campaignRoutes = await getCampaignRoutes();
  const destination = campaignRoutes[0]?.href || "/accounts";

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
}

export default function Home() {
  return null;
}
