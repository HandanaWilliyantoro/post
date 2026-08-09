import postformeClient from "@/lib/api/postformeClient";

function normalizeText(value) {
  return String(value || "").trim();
}

export async function listSocialAccountFeed(socialAccountId, options = {}) {
  const id = normalizeText(socialAccountId);

  if (!id) {
    throw new Error("social_account_id is required");
  }

  const limit = Math.max(1, Math.min(100, Number(options.limit || 50) || 50));
  let offset = Math.max(0, Number(options.offset || 0) || 0);
  const maxPages = Math.max(1, Math.min(20, Number(options.maxPages || 5) || 5));
  const items = [];

  for (let page = 0; page < maxPages; page += 1) {
    const response = await postformeClient.get(
      `/social-account-feeds/${encodeURIComponent(id)}`,
      {
        params: {
          limit,
          offset,
        },
        suppressErrorLog: Boolean(options.suppressErrorLog),
        signal: options.signal,
      }
    );

    const pageItems = Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response)
        ? response
        : [];

    items.push(...pageItems);

    if (!pageItems.length || !response?.meta?.next) {
      break;
    }

    offset += pageItems.length;
  }

  return items;
}
