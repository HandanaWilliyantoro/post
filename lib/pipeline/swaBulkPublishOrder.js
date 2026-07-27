const SWA_CAMPAIGN_PATTERN = /(^|[^a-z0-9])swa([^a-z0-9]|$)/;

const SWA_BULK_PUBLISH_ORDER = [
  { username: "truerepublicanhub", aliases: ["truereplubicanhub"] },
  { username: "truerepublicanmedia" },
  { username: "truth4american" },
  { username: "truth4patriots" },
  { username: "red4truth" },
  { username: "redvault1776" },
  { username: "cnsvredpill" },
  { username: "cnsrvtvpill" },
  { username: "truecnsvrtv" },
  { username: "redvalor1776" },
  { username: "conservativication" },
  { username: "cnsrvtvamerican" },
  { username: "maganews1776" },
  { username: "conservativenews1776" },
  { username: "conservativepatriots1776" },
  { username: "patriotsvoice1776" },
  { username: "truepatriotsmedia" },
  { username: "trueamericanmedia" },
  { username: "thecnsrvtvmedia" },
  { username: "truthmedia803" },
];

function normalizeOrderUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/^@+/, "");
}

function normalizeCampaignValue(value) {
  return String(value || "").trim().toLowerCase();
}

function buildOrderIndex() {
  const index = new Map();

  SWA_BULK_PUBLISH_ORDER.forEach((entry, orderIndex) => {
    for (const username of [entry.username, ...(entry.aliases || [])]) {
      index.set(normalizeOrderUsername(username), orderIndex);
    }
  });

  return index;
}

const SWA_BULK_PUBLISH_ORDER_INDEX = buildOrderIndex();

export function isSwaCampaign(campaignContext = {}) {
  const context =
    typeof campaignContext === "string"
      ? { campaignSlug: campaignContext }
      : campaignContext || {};
  const campaign = context.campaign || {};
  const values = [
    context.campaignSlug,
    context.slug,
    context.label,
    campaign.slug,
    campaign.label,
    campaign.niche,
  ]
    .map(normalizeCampaignValue)
    .filter(Boolean);

  return values.some((value) => SWA_CAMPAIGN_PATTERN.test(value));
}

export function getSwaBulkPublishOrderUsernames() {
  return SWA_BULK_PUBLISH_ORDER.map((entry) => entry.username);
}

function summarizeList(values, limit = 5) {
  const items = values.filter(Boolean);
  const visibleItems = items.slice(0, limit).join(", ");
  const overflow = items.length > limit ? ` and ${items.length - limit} more` : "";

  return `${visibleItems}${overflow}`;
}

function buildSwaTargetEntries(targets) {
  const invalidTargets = [];
  const duplicateTargets = [];
  const targetEntries = [];
  const seenOrderIndexes = new Map();

  for (const target of targets) {
    const username = normalizeOrderUsername(target?.username);
    const orderIndex = SWA_BULK_PUBLISH_ORDER_INDEX.get(username);

    if (orderIndex === undefined) {
      invalidTargets.push(target?.username || target?.id || "unknown");
      continue;
    }

    if (seenOrderIndexes.has(orderIndex)) {
      duplicateTargets.push(target?.username || target?.id || "unknown");
      continue;
    }

    seenOrderIndexes.set(orderIndex, target);
    targetEntries.push({ target, orderIndex });
  }

  const missingTargets = SWA_BULK_PUBLISH_ORDER
    .filter((entry, orderIndex) => !seenOrderIndexes.has(orderIndex))
    .map((entry) => entry.username);
  const issues = [];

  if (missingTargets.length) {
    issues.push(`missing ${summarizeList(missingTargets)}`);
  }

  if (invalidTargets.length) {
    issues.push(`unlisted ${summarizeList(invalidTargets)}`);
  }

  if (duplicateTargets.length) {
    issues.push(`duplicate ${summarizeList(duplicateTargets)}`);
  }

  if (issues.length) {
    throw new Error(
      `SWA bulk publish requires the assigned accounts to match the fixed ${SWA_BULK_PUBLISH_ORDER.length}-account order: ${issues.join("; ")}`
    );
  }

  return targetEntries
    .sort((left, right) => left.orderIndex - right.orderIndex);
}

export function orderSwaBulkPublishTargets(targets, campaignContext = {}) {
  if (!isSwaCampaign(campaignContext)) {
    return null;
  }

  return buildSwaTargetEntries(targets).map((entry) => entry.target);
}

function normalizeVideoFilename(value) {
  return normalizeOrderUsername(String(value || "").replace(/\.[^.]+$/, ""));
}

function buildSwaVideoEntries(videos) {
  const invalidVideos = [];
  const duplicateVideos = [];
  const seenOrderIndexes = new Map();

  for (const video of videos) {
    const filename = String(video?.name || "").trim();
    const orderIndex = SWA_BULK_PUBLISH_ORDER_INDEX.get(
      normalizeVideoFilename(filename)
    );

    if (orderIndex === undefined) {
      invalidVideos.push(filename || "unknown");
      continue;
    }

    if (seenOrderIndexes.has(orderIndex)) {
      duplicateVideos.push(filename || "unknown");
      continue;
    }

    seenOrderIndexes.set(orderIndex, video);
  }

  const missingVideos = SWA_BULK_PUBLISH_ORDER
    .filter((entry, orderIndex) => !seenOrderIndexes.has(orderIndex))
    .map((entry) => `${entry.username}.mp4`);
  const issues = [];

  if (missingVideos.length) {
    issues.push(`missing ${summarizeList(missingVideos)}`);
  }

  if (invalidVideos.length) {
    issues.push(`unmatched ${summarizeList(invalidVideos)}`);
  }

  if (duplicateVideos.length) {
    issues.push(`duplicate ${summarizeList(duplicateVideos)}`);
  }

  if (issues.length) {
    throw new Error(
      `SWA bulk publish video filenames must match assigned account usernames: ${issues.join("; ")}`
    );
  }

  return seenOrderIndexes;
}

export function buildSwaFilenameMatchedJobs(
  videos,
  targets,
  captions = [],
  campaignContext = {}
) {
  if (!isSwaCampaign(campaignContext)) {
    return null;
  }

  const videoByOrderIndex = buildSwaVideoEntries(videos);

  return buildSwaTargetEntries(targets).map((entry, index) => ({
    video: videoByOrderIndex.get(entry.orderIndex),
    caption: String(captions[index] || "").trim() || null,
    targets: [entry.target],
    matchType: "swa-filename",
  }));
}
