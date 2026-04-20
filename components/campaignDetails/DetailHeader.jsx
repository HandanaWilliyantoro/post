import Link from "next/link";

import PrimaryButton from "@/components/PrimaryButton";

export default function DetailHeader({
  addButtonLabel,
  campaign,
  disableAddPost,
  extraActions,
  isAccountsView,
  title,
  onOpenAddModal,
}) {
  return (
    <header className="detail-header">
      <div className="detail-header-left">
        <Link href={campaign.href} className="detail-back-link">
          <span aria-hidden="true">&larr;</span> Back to overview
        </Link>
        <div className="detail-title-row">
          <h1 className="detail-title">{title}</h1>
        </div>
      </div>

      <div className="detail-header-right">
        {extraActions}
        {!isAccountsView && disableAddPost ? (
          <p className="detail-inline-note">No assigned accounts for this campaign.</p>
        ) : null}

        <PrimaryButton className="dashboard-button-inline detail-action-button" onClick={onOpenAddModal} disabled={disableAddPost}>
          {addButtonLabel}
        </PrimaryButton>
      </div>
    </header>
  );
}
