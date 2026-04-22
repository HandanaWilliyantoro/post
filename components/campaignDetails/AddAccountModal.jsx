import { useMemo, useState } from "react";

import ModalShell from "@/components/campaignDetails/ModalShell";
import PrimaryButton from "@/components/PrimaryButton";

export default function AddAccountModal({ formError, formSuccess, formik, idleAccounts = [], onClose }) {
  const selectedAccount = idleAccounts.find((account) => account.id === formik.values.accountId);
  const [searchText, setSearchText] = useState(selectedAccount?.username || "");
  const [isOpen, setIsOpen] = useState(false);
  const filteredAccounts = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return idleAccounts
      .filter((account) => !needle || String(account?.username || "").toLowerCase().includes(needle))
      .slice(0, 40);
  }, [idleAccounts, searchText]);

  function selectAccount(account) {
    formik.setFieldValue("accountId", account.id);
    formik.setFieldTouched("accountId", true, false);
    setSearchText(account.username || "");
    setIsOpen(false);
  }

  return (
    <ModalShell title="Add account" onClose={onClose}>
      <form className="detail-account-form" onSubmit={formik.handleSubmit}>
        <div className="detail-form-grid">
          <label className="detail-form-field detail-form-field-wide"><span className="detail-form-label">Idle account</span><div className="detail-combobox"><input className="detail-form-input" value={searchText} onChange={(event) => { setSearchText(event.target.value); formik.setFieldValue("accountId", ""); setIsOpen(true); }} onFocus={() => setIsOpen(true)} onBlur={() => window.setTimeout(() => { setIsOpen(false); formik.setFieldTouched("accountId", true); }, 120)} placeholder="Search idle account..." autoComplete="off" role="combobox" aria-expanded={isOpen} aria-controls="idle-account-options" /><input type="hidden" name="accountId" value={formik.values.accountId} />{isOpen ? <div className="detail-combobox-menu" id="idle-account-options" role="listbox">{filteredAccounts.length ? filteredAccounts.map((account) => <button key={account.id} type="button" className="detail-combobox-option" onMouseDown={(event) => event.preventDefault()} onClick={() => selectAccount(account)} role="option" aria-selected={formik.values.accountId === account.id}><span>{account.username}</span><small>{account.id}</small></button>) : <p className="detail-combobox-empty">No idle accounts match.</p>}</div> : null}</div></label>
          <label className="detail-form-field"><span className="detail-form-label">Platform</span><div className="detail-form-static">Instagram</div></label>
          <label className="detail-form-field"><span className="detail-form-label">Status</span><div className="detail-form-static">Active</div></label>
        </div>
        {formik.touched.accountId && formik.errors.accountId ? <p className="detail-form-message detail-form-message-error">{formik.errors.accountId}</p> : null}
        {!idleAccounts.length ? <p className="detail-form-message detail-form-message-error">No idle accounts available. Open All Accounts to sync from PostOnce.</p> : null}
        {formError ? <p className="detail-form-message detail-form-message-error">{formError}</p> : null}
        {formSuccess ? <p className="detail-form-message detail-form-message-success">{formSuccess}</p> : null}
        <div className="detail-modal-actions">
          <PrimaryButton className="dashboard-button-inline" variant="ghost" onClick={onClose} type="button">Cancel</PrimaryButton>
          <PrimaryButton className="dashboard-button-inline detail-action-button" type="submit" disabled={formik.isSubmitting}>{formik.isSubmitting ? "Creating..." : "Create account"}</PrimaryButton>
        </div>
      </form>
    </ModalShell>
  );
}
