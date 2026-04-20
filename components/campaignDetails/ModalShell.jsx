export default function ModalShell({ title, onClose, children, modalClassName = "" }) {
  return (
    <div className="detail-modal-overlay" role="dialog" aria-modal="true">
      <div className={`detail-modal ${modalClassName}`.trim()}>
        <div className="detail-modal-header">
          <h3 className="detail-modal-title">{title}</h3>
          <button type="button" className="detail-icon-button" onClick={onClose} aria-label="Close dialog">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="detail-modal-body">{children}</div>
      </div>
    </div>
  );
}
