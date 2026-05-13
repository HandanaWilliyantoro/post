function normalizeTargetAccountId(target) {
  if (!target || typeof target !== "object") {
    return "";
  }

  return String(target.account_id || target.id || "").trim();
}

export function buildStoredPostTarget(target = {}) {
  return {
    account_id: normalizeTargetAccountId(target),
    username: String(target?.username || "").trim(),
    platform: String(target?.platform || "").trim(),
    status: String(target?.status || "").trim(),
  };
}

export function buildPostOnceTarget(target = {}) {
  const accountId = normalizeTargetAccountId(target);

  if (!accountId) {
    return null;
  }

  const contentOverride = String(target?.content_override || "").trim();

  return {
    account_id: accountId,
    ...(contentOverride ? { content_override: contentOverride } : {}),
  };
}

export function buildPostOnceTargets(targets = []) {
  if (!Array.isArray(targets)) {
    return [];
  }

  return targets.map(buildPostOnceTarget).filter(Boolean);
}
