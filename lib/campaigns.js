export const campaignRoutes = [
  {
    slug: "kick-campaign",
    label: "Kick Campaign",
    description:
      "A fast-turn content campaign focused on sports momentum, creator highlights, and high-frequency posting windows.",
    href: "/campaigns/kick-campaign",
    icon: "kick",
    metrics: {
      totalPosts: {
        value: 186,
        trend: [38, 52, 41, 59, 66, 72],
      },
      queuedPosts: {
        value: 48,
        trend: [12, 18, 16, 20, 26, 31],
      },
      totalAccounts: {
        value: 9,
        trend: [3, 4, 5, 7, 8, 9],
      },
    },
  },
  {
    slug: "lospollostv-campaign",
    label: "LosPollosTv Campaign",
    description:
      "A personality-led entertainment campaign built around reaction clips, stream moments, and audience retention plays.",
    href: "/campaigns/lospollostv-campaign",
    icon: "play",
    metrics: {
      totalPosts: {
        value: 244,
        trend: [45, 58, 62, 70, 81, 93],
      },
      queuedPosts: {
        value: 67,
        trend: [15, 21, 24, 29, 35, 40],
      },
      totalAccounts: {
        value: 12,
        trend: [4, 5, 7, 8, 10, 12],
      },
    },
  },
  {
    slug: "tony-robbins-campaign",
    label: "Tony Robbins Campaign",
    description:
      "A motivation and self-improvement campaign designed for inspirational cuts, mindset hooks, and daily consistency.",
    href: "/campaigns/tony-robbins-campaign",
    icon: "spark",
    metrics: {
      totalPosts: {
        value: 132,
        trend: [22, 28, 31, 36, 44, 50],
      },
      queuedPosts: {
        value: 34,
        trend: [8, 10, 11, 13, 16, 18],
      },
      totalAccounts: {
        value: 6,
        trend: [2, 3, 4, 4, 5, 6],
      },
    },
  },
  {
    slug: "debates-campaign",
    label: "Debates Campaign",
    description:
      "A commentary-driven campaign for polarizing clips, rapid discourse packaging, and high-engagement discussion topics.",
    href: "/campaigns/debates-campaign",
    icon: "debate",
    metrics: {
      totalPosts: {
        value: 168,
        trend: [31, 35, 43, 47, 54, 63],
      },
      queuedPosts: {
        value: 52,
        trend: [10, 14, 17, 20, 24, 28],
      },
      totalAccounts: {
        value: 8,
        trend: [3, 4, 5, 6, 7, 8],
      },
    },
  },
  {
    slug: "news-campaign",
    label: "News Campaign",
    description:
      "A headline-focused campaign built for daily news recaps, topical coverage bursts, and timely queue management.",
    href: "/campaigns/news-campaign",
    icon: "news",
    metrics: {
      totalPosts: {
        value: 205,
        trend: [36, 42, 51, 61, 68, 79],
      },
      queuedPosts: {
        value: 58,
        trend: [12, 16, 21, 25, 29, 34],
      },
      totalAccounts: {
        value: 10,
        trend: [4, 5, 6, 8, 9, 10],
      },
    },
  },
];

export function findCampaignBySlug(slug) {
  return campaignRoutes.find((campaign) => campaign.slug === slug) || null;
}
