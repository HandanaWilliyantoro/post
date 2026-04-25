import StatusPill from "@/components/campaignDetails/StatusPill";
import {
  formatDate,
  shorten,
} from "@/components/campaignDetails/utils";

function EmptyRow({ isAccountsView }) {
  const colSpan = isAccountsView ? 5 : 4;
  return (
    <tr>
      <td colSpan={colSpan} className="detail-empty">
        Nothing matches your filters yet.
      </td>
    </tr>
  );
}

function AccountRow({ account, onRemoveAccount, removingAccountId }) {
  const isRemoving = removingAccountId === account.id;

  return (
    <tr key={account.id}>
      <td className="detail-strong">{account.username || "-"}</td>
      <td>{account.platform || "-"}</td>
      <td><StatusPill value={account.status} /></td>
      <td className="detail-mono">{account.id}</td>
      <td>
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

function PostRow({ post }) {
  const status = String(post?.status || "scheduled").trim() || "scheduled";

  return (
    <tr key={post.id}>
      <td><div className="detail-post-main"><span className="detail-strong">{shorten(post.content)}</span><span className="detail-post-subtle">Media: {post?.media?.[0]?.type || "video"}</span><span className="detail-post-subtle">Origin: {post?.origin || "-"}</span><span className="detail-post-subtle">Campaign type: {post?.campaignType || "manual"}</span>{post?.campaignId ? <span className="detail-post-subtle">Campaign ID: {post.campaignId}</span> : null}</div></td>
      <td>{formatDate(post.publish_at)}</td>
      <td><StatusPill value={status} /></td>
      <td className="detail-mono">{post.id}</td>
    </tr>
  );
}

export default function DetailTable(props) {
  const {
    filteredRows,
    isAccountsView,
    onRemoveAccount,
    removingAccountId,
  } = props;
  return (
    <section className="detail-table-card">
      <table className="detail-table">
        <thead>{isAccountsView ? <tr><th>Username</th><th>Platform</th><th>Status</th><th>ID</th><th>Action</th></tr> : <tr><th>Content</th><th>Publish at</th><th>Status</th><th>ID</th></tr>}</thead>
        <tbody>
          {!filteredRows.length ? <EmptyRow isAccountsView={isAccountsView} /> : null}
          {isAccountsView ? filteredRows.map((account) => <AccountRow key={account.id} account={account} onRemoveAccount={onRemoveAccount} removingAccountId={removingAccountId} />) : filteredRows.map((post) => <PostRow key={post.id} post={post} />)}
        </tbody>
      </table>
    </section>
  );
}
