import StatusPill from "@/components/campaignDetails/StatusPill";
import { formatAccountPlatformLabel } from "@/lib/accounts/platforms";
import {
  formatDate,
  shorten,
  summarizeTargets,
} from "@/components/campaignDetails/utils";

function EmptyRow({ isAccountsView }) {
  const colSpan = 5;
  return (
    <tr>
      <td colSpan={colSpan} className="detail-empty" data-label="">
        Nothing matches your filters yet.
      </td>
    </tr>
  );
}

function AccountRow({ account, onRemoveAccount, removingAccountId }) {
  const isRemoving = removingAccountId === account.id;

  return (
    <tr key={account.id}>
      <td className="detail-strong" data-label="Username">{account.username || "-"}</td>
      <td data-label="Platform">{account.platform ? formatAccountPlatformLabel(account.platform) : "-"}</td>
      <td data-label="Status"><StatusPill value={account.status} /></td>
      <td className="detail-mono" data-label="ID">{account.id}</td>
      <td data-label="Action">
        <button
          type="button"
          className="detail-icon-button"
          onClick={() => onRemoveAccount?.(account)}
          disabled={isRemoving}
          aria-label={`Remove ${account.username || "account"} from campaign`}
          title="Remove account"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

function PostRow({ onDeletePost, onRetryPost, post, removingPostId, retryingPostId }) {
  const status = String(post?.status || "scheduled").trim() || "scheduled";
  const isRemoving = removingPostId === post.id;
  const isRetrying = retryingPostId === post.id;
  const canRetry =
    String(status || "").trim().toLowerCase() === "failed" &&
    post?.localOnly === true;

  return (
    <tr key={post.id}>
      <td data-label="Content"><div className="detail-post-main"><span className="detail-strong">{shorten(post.content)}</span><span className="detail-post-subtle">Media: {post?.media?.[0]?.type || "video"}</span><span className="detail-post-subtle">Origin: {post?.origin || "-"}</span></div></td>
      <td data-label="Publish at">{formatDate(post.publish_at)}</td>
      <td data-label="Account">{summarizeTargets(post?.targets)}</td>
      <td className="detail-mono" data-label="ID">{post.id}</td>
      <td data-label="Action">
        <div className="detail-action-group">
          {canRetry ? (
            <button
              type="button"
              className="detail-icon-button"
              onClick={() => onRetryPost?.(post)}
              disabled={isRemoving || isRetrying}
              aria-label={`Retry failed post ${post.id}`}
              title="Retry failed post"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M20 11a8 8 0 1 0 2 5.3" />
                <path d="M20 4v7h-7" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className="detail-icon-button"
            onClick={() => onDeletePost?.(post)}
            disabled={isRemoving || isRetrying}
            aria-label={`Delete post ${post.id}`}
            title="Delete post"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function DetailTable(props) {
  const {
    filteredRows,
    isAccountsView,
    onDeletePost,
    onRemoveAccount,
    onRetryPost,
    removingAccountId,
    removingPostId,
    retryingPostId,
  } = props;
  return (
    <section className="detail-table-card">
      <table className="detail-table">
        <thead>{isAccountsView ? <tr><th>Username</th><th>Platform</th><th>Status</th><th>ID</th><th>Action</th></tr> : <tr><th>Content</th><th>Publish at</th><th>Account</th><th>ID</th><th>Action</th></tr>}</thead>
        <tbody>
          {!filteredRows.length ? <EmptyRow isAccountsView={isAccountsView} /> : null}
          {isAccountsView ? filteredRows.map((account) => <AccountRow key={account.id} account={account} onRemoveAccount={onRemoveAccount} removingAccountId={removingAccountId} />) : filteredRows.map((post) => <PostRow key={post.id} post={post} onDeletePost={onDeletePost} onRetryPost={onRetryPost} removingPostId={removingPostId} retryingPostId={retryingPostId} />)}
        </tbody>
      </table>
    </section>
  );
}
