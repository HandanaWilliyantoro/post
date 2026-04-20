import ModalShell from "@/components/campaignDetails/ModalShell";
import PrimaryButton from "@/components/PrimaryButton";

export default function AddAccountModal({ formError, formSuccess, formik, onClose }) {
  return (
    <ModalShell title="Add account" onClose={onClose}>
      <form className="detail-account-form" onSubmit={formik.handleSubmit}>
        <div className="detail-form-grid">
          <label className="detail-form-field"><span className="detail-form-label">Username</span><input className="detail-form-input" name="username" value={formik.values.username} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="newaccountname" required /></label>
          <label className="detail-form-field"><span className="detail-form-label">Platform</span><div className="detail-form-static">Instagram</div></label>
          <label className="detail-form-field"><span className="detail-form-label">Status</span><select className="detail-form-input" name="status" value={formik.values.status} onChange={formik.handleChange} onBlur={formik.handleBlur}><option value="active">Active</option><option value="inactive">Inactive</option><option value="paused">Paused</option></select></label>
          <label className="detail-form-field"><span className="detail-form-label">Custom ID</span><input className="detail-form-input" name="id" value={formik.values.id} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="Optional UUID override" /></label>
          <label className="detail-form-field detail-form-field-wide"><span className="detail-form-label">Avatar URL</span><input className="detail-form-input" name="avatar_url" type="url" value={formik.values.avatar_url} onChange={formik.handleChange} onBlur={formik.handleBlur} placeholder="https://..." /></label>
        </div>
        {formik.touched.username && formik.errors.username ? <p className="detail-form-message detail-form-message-error">{formik.errors.username}</p> : null}
        {formik.touched.avatar_url && formik.errors.avatar_url ? <p className="detail-form-message detail-form-message-error">{formik.errors.avatar_url}</p> : null}
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
