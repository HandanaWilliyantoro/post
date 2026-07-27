import postformeClient from "@/lib/api/postformeClient";
import { normalizeAccountPlatform } from "@/lib/accounts/platforms";

const SUPPORTED_AUTH_PERMISSIONS = new Set(["posts", "feeds"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((permission) => normalizeText(permission).toLowerCase())
        .filter((permission) => SUPPORTED_AUTH_PERMISSIONS.has(permission))
    ),
  ];
}

function buildAuthUrlPayload(payload = {}) {
  const platform = normalizeAccountPlatform(payload.platform, "");

  if (!platform) {
    throw new Error("Platform is required");
  }

  const requestPayload = { platform };
  const externalId = normalizeText(payload.external_id);
  const redirectUrlOverride = normalizeText(payload.redirect_url_override);
  const permissions = normalizePermissions(payload.permissions);

  if (externalId) {
    requestPayload.external_id = externalId;
  }

  if (
    payload.platform_data &&
    typeof payload.platform_data === "object" &&
    !Array.isArray(payload.platform_data)
  ) {
    requestPayload.platform_data = payload.platform_data;
  }

  if (redirectUrlOverride) {
    requestPayload.redirect_url_override = redirectUrlOverride;
  }

  if (permissions.length) {
    requestPayload.permissions = permissions;
  }

  return requestPayload;
}

function shouldRetryWithoutRedirectOverride(error) {
  const statusCode = Number(error?.response?.status || 0);

  return statusCode === 400 || statusCode === 422;
}

function normalizeAuthUrlResponse(response, requestPayload, meta = {}) {
  const url = normalizeText(response?.url);

  if (!url) {
    throw new Error("PostForMe did not return an account connection URL");
  }

  return {
    url,
    platform: normalizeAccountPlatform(response?.platform || requestPayload.platform),
    external_id: requestPayload.external_id || "",
    redirectOverrideApplied: Boolean(meta.redirectOverrideApplied),
  };
}

export async function createSocialAccountAuthUrl(payload = {}, options = {}) {
  const requestPayload = buildAuthUrlPayload(payload);
  const hasRedirectOverride = Boolean(requestPayload.redirect_url_override);

  try {
    const response = await postformeClient.post(
      "/social-accounts/auth-url",
      requestPayload,
      {
        signal: options.signal,
        suppressErrorLog: hasRedirectOverride,
      }
    );

    return normalizeAuthUrlResponse(response, requestPayload, {
      redirectOverrideApplied: hasRedirectOverride,
    });
  } catch (error) {
    if (!hasRedirectOverride || !shouldRetryWithoutRedirectOverride(error)) {
      throw error;
    }

    const retryPayload = { ...requestPayload };
    delete retryPayload.redirect_url_override;

    const response = await postformeClient.post(
      "/social-accounts/auth-url",
      retryPayload,
      { signal: options.signal }
    );

    return normalizeAuthUrlResponse(response, retryPayload, {
      redirectOverrideApplied: false,
    });
  }
}
