import { getCampaignRoutes } from "@/lib/campaigns";

export async function getServerSideProps() {
  const campaignRoutes = await getCampaignRoutes();

  return {
    redirect: {
      destination: campaignRoutes[0].href,
      permanent: false,
    },
  };
}

export default function Home() {
  return null;
}
