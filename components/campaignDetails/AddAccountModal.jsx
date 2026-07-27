import { useMemo, useState } from "react";
import { useRouter } from "next/router";

import ModalShell from "@/components/campaignDetails/ModalShell";
import PrimaryButton from "@/components/PrimaryButton";
import useFormErrorSnackbar from "@/components/useFormErrorSnackbar";
import {
  ACCOUNT_PLATFORM_OPTIONS,
  DEFAULT_ACCOUNT_PLATFORM,
  formatAccountPlatformLabel,
} from "@/lib/accounts/platforms";
import { showErrorSnackbar, showSuccessSnackbar } from "@/lib/ui/snackbar";

function getAccountAvatarUrl(account) {
  return String(
    account?.avatar_url || account?.avatarUrl || account?.profile_image_url || ""
  ).trim();
}

function getAccountInitials(account) {
  const username = String(account?.username || "").trim().replace(/^@+/, "");

  if (!username) {
    return "?";
  }

  return username.slice(0, 2).toUpperCase();
}

export default function AddAccountModal({
  availableAccounts = [],
  campaignSlug = "",
  formError,
  formSuccess,
  formik,
  onClose,
}) {
  const router = useRouter();
  const selectedAccount = availableAccounts.find(
    (account) => account.id === formik.values.accountId
  );
  const [searchText, setSearchText] = useState(selectedAccount?.username || "");
  const [isOpen, setIsOpen] = useState(false);
  const [connectPlatform, setConnectPlatform] = useState(
    DEFAULT_ACCOUNT_PLATFORM
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useFormErrorSnackbar(formik);

  const filteredAccounts = useMemo(() => {
    const needle = searchText.trim().toLowerCase();

    return availableAccounts
      .filter((account) => {
        if (!needle) {
          return true;
        }

        const username = String(account?.username || "").toLowerCase();
        const platform = String(account?.platform || "").toLowerCase();
        const accountId = String(account?.id || "").toLowerCase();

        return (
          username.includes(needle) ||
          platform.includes(needle) ||
          accountId.includes(needle)
        );
      })
      .slice(0, 40);
  }, [availableAccounts, searchText]);

  function selectAccount(account) {
    formik.setFieldValue("accountId", account.id);
    formik.setFieldTouched("accountId", true, false);
    setSearchText(account.username || "");
    setIsOpen(false);
  }

  async function handleConnectAccount() {
    const slug = String(campaignSlug || router.query?.slug || "").trim();

    if (!slug) {
      showErrorSnackbar("Campaign is required");
      return;
    }

    const authWindow = window.open("about:blank", "_blank");

    if (!authWindow) {
      showErrorSnackbar("Allow pop-ups to connect the account.");
      return;
    }

    authWindow.opener = null;
    setIsConnecting(true);

    try {
      const response = await fetch("/api/accounts/connect-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignSlug: slug,
          platform: connectPlatform,
          permissions: ["posts"],
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to connect account");
      }

      const authUrl = String(payload?.data?.url || "").trim();

      if (!authUrl) {
        throw new Error("Connection URL is missing");
      }

      authWindow.location.href = authUrl;
      showSuccessSnackbar("Connection opened in a new tab.");
    } catch (error) {
      authWindow.close();
      showErrorSnackbar(error?.message || "Failed to connect account");
      setIsConnecting(false);
    }
  }

  async function handleRefreshAccounts() {
    const slug = String(campaignSlug || router.query?.slug || "").trim();

    if (!slug) {
      showErrorSnackbar("Campaign is required");
      return;
    }

    setIsRefreshing(true);

    try {
      const params = new URLSearchParams({
        campaignSlug: slug,
        sync: "1",
      });
      const response = await fetch(`/api/accounts?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to refresh accounts");
      }

      if (payload?.warning) {
        showErrorSnackbar(payload.warning, { autoHideDuration: 6000 });
        setIsRefreshing(false);
        return;
      }

      showSuccessSnackbar("Accounts refreshed.");
      router.reload();
    } catch (error) {
      showErrorSnackbar(error?.message || "Failed to refresh accounts");
      setIsRefreshing(false);
    }
  }

  return (
    <ModalShell title="Add account" onClose={onClose}>
      <form className="detail-account-form" onSubmit={formik.handleSubmit}>
        <div className="detail-form-grid">
          <label className="detail-form-field detail-form-field-wide">
            <span className="detail-form-label">Connect account</span>
            <div className="detail-connect-controls">
              <select
                className="detail-form-input detail-connect-select"
                value={connectPlatform}
                onChange={(event) => setConnectPlatform(event.target.value)}
                disabled={isConnecting || isRefreshing}
              >
                {ACCOUNT_PLATFORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <PrimaryButton
                className="dashboard-button-inline detail-action-button"
                disabled={isConnecting || isRefreshing}
                onClick={handleConnectAccount}
                type="button"
              >
                {isConnecting ? "Connecting..." : "Connect"}
              </PrimaryButton>
              <PrimaryButton
                className="dashboard-button-inline"
                disabled={isConnecting || isRefreshing}
                onClick={handleRefreshAccounts}
                type="button"
                variant="ghost"
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </PrimaryButton>
            </div>
          </label>
          <label className="detail-form-field detail-form-field-wide">
            <span className="detail-form-label">Available account</span>
            <div className="detail-combobox">
              <input
                className="detail-form-input"
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  formik.setFieldValue("accountId", "");
                  setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onBlur={() =>
                  window.setTimeout(() => {
                    setIsOpen(false);
                    formik.setFieldTouched("accountId", true);
                  }, 120)
                }
                placeholder="Search available account..."
                autoComplete="off"
                role="combobox"
                aria-expanded={isOpen}
                aria-controls="idle-account-options"
              />
              <input
                type="hidden"
                name="accountId"
                value={formik.values.accountId}
              />
              {isOpen ? (
                <div
                  className="detail-combobox-menu"
                  id="idle-account-options"
                  role="listbox"
                >
                  {filteredAccounts.length ? (
                    filteredAccounts.map((account) => {
                      const avatarUrl = getAccountAvatarUrl(account);

                      return (
                        <button
                          key={account.id}
                          type="button"
                          className="detail-combobox-option"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectAccount(account)}
                          role="option"
                          aria-selected={formik.values.accountId === account.id}
                        >
                          <span className="detail-combobox-avatar" aria-hidden="true">
                            <span className="detail-combobox-avatar-fallback">
                              {getAccountInitials(account)}
                            </span>
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt=""
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                }}
                              />
                            ) : null}
                          </span>
                          <span className="detail-combobox-option-content">
                            <span className="detail-combobox-option-title">
                              {account.username}
                            </span>
                            <small>
                              {`${formatAccountPlatformLabel(account?.platform)} - ${account.id}`}
                            </small>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="detail-combobox-empty">
                      No available accounts match.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </label>
          <label className="detail-form-field">
            <span className="detail-form-label">Platform</span>
            <div className="detail-form-static">
              {selectedAccount
                ? formatAccountPlatformLabel(selectedAccount.platform)
                : "Select an account"}
            </div>
          </label>
          <label className="detail-form-field">
            <span className="detail-form-label">Status</span>
            <div className="detail-form-static">Active</div>
          </label>
        </div>
        {formik.touched.accountId && formik.errors.accountId ? (
          <p className="detail-form-message detail-form-message-error">
            {formik.errors.accountId}
          </p>
        ) : null}
        {!availableAccounts.length ? (
          <p className="detail-form-message detail-form-message-error">
            No available connected accounts.
          </p>
        ) : null}
        {formError ? (
          <p className="detail-form-message detail-form-message-error">
            {formError}
          </p>
        ) : null}
        {formSuccess ? (
          <p className="detail-form-message detail-form-message-success">
            {formSuccess}
          </p>
        ) : null}
        <div className="detail-modal-actions">
          <PrimaryButton
            className="dashboard-button-inline"
            variant="ghost"
            onClick={onClose}
            type="button"
          >
            Cancel
          </PrimaryButton>
          <PrimaryButton
            className="dashboard-button-inline detail-action-button"
            type="submit"
            disabled={formik.isSubmitting}
          >
            {formik.isSubmitting ? "Adding..." : "Add account"}
          </PrimaryButton>
        </div>
      </form>
    </ModalShell>
  );
}
