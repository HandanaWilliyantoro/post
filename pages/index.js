import { campaignRoutes } from "@/lib/campaigns";

export async function getServerSideProps() {
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
