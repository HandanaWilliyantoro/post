import dynamic from "next/dynamic";

import ModalShell from "@/components/campaignDetails/ModalShell";
import PrimaryButton from "@/components/PrimaryButton";
import { getPostPreviewSrc, summarizeTargets } from "@/components/campaignDetails/utils";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

export default function EditPostModal({ editingPost, formError, formSuccess, formik, onClose }) {
  if (!editingPost) return null;

  return (
    <ModalShell title="Video editor" onClose={onClose} modalClassName="detail-editor-modal">
      <div className="detail-editor-body">
        <div className="detail-editor-preview">
          {getPostPreviewSrc(editingPost) ? <div className="detail-editor-player-shell"><ReactPlayer url={getPostPreviewSrc(editingPost)} controls width="100%" height="100%" className="detail-editor-player" /></div> : <div className="detail-editor-empty">Preview unavailable</div>}
          <div className="detail-editor-meta"><span className="detail-editor-chip">{editingPost?.clip_moment?.start_time || "—"} - {editingPost?.clip_moment?.end_time || "—"}</span><span className="detail-editor-chip">{editingPost?.clip_moment?.viral_score ? `Viral ${editingPost.clip_moment.viral_score}` : "Queued"}</span></div>
        </div>

        <form className="detail-editor-panel" onSubmit={formik.handleSubmit}>
          <label className="detail-form-field detail-form-field-wide"><span className="detail-form-label">Caption</span><textarea className="detail-form-input detail-form-textarea" name="content" value={formik.values.content} onChange={formik.handleChange} onBlur={formik.handleBlur} rows={8} /></label>
          <label className="detail-form-field detail-form-field-wide"><span className="detail-form-label">Publish at</span><input className="detail-form-input" type="datetime-local" name="publish_at" value={formik.values.publish_at} onChange={formik.handleChange} onBlur={formik.handleBlur} /></label>
          <label className="detail-form-field detail-form-field-wide"><span className="detail-form-label">External ID</span><div className="detail-form-static">{editingPost.external_id || "—"}</div></label>
          <label className="detail-form-field detail-form-field-wide"><span className="detail-form-label">Replace video</span><input className="detail-form-input" type="file" name="video" accept="video/*" onChange={(event) => formik.setFieldValue("video", event.currentTarget.files?.[0] || null)} onBlur={() => formik.setFieldTouched("video", true)} /></label>
          <label className="detail-form-field detail-form-field-wide"><span className="detail-form-label">Assigned targets</span><div className="detail-form-static detail-form-static-wrap">{summarizeTargets(editingPost.targets)}</div></label>
          {formik.touched.content && formik.errors.content ? <p className="detail-form-message detail-form-message-error">{formik.errors.content}</p> : null}
          {formik.touched.publish_at && formik.errors.publish_at ? <p className="detail-form-message detail-form-message-error">{formik.errors.publish_at}</p> : null}
          {formError ? <p className="detail-form-message detail-form-message-error">{formError}</p> : null}
          {formSuccess ? <p className="detail-form-message detail-form-message-success">{formSuccess}</p> : null}
          <div className="detail-modal-actions">
            <PrimaryButton className="dashboard-button-inline" variant="ghost" type="button" onClick={onClose}>Close</PrimaryButton>
            <PrimaryButton className="dashboard-button-inline detail-action-button" type="submit" disabled={formik.isSubmitting}>{formik.isSubmitting ? "Saving..." : "Save changes"}</PrimaryButton>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
