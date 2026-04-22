import StatusPill from "@/components/campaignDetails/StatusPill";
import {
  formatDate,
  shorten,
} from "@/components/campaignDetails/utils";

function EmptyRow({ isAccountsView }) {
  const colSpan = isAccountsView ? 4 : 3;
  return (
    <tr>
      <td colSpan={colSpan} className="detail-empty">
        Nothing matches your filters yet.
      </td>
    </tr>
  );
}

function AccountRow({ account }) {
  return (
    <tr key={account.id}>
      <td className="detail-strong">{account.username || "-"}</td>
      <td>{account.platform || "-"}</td>
      <td><StatusPill value={account.status} /></td>
      <td className="detail-mono">{account.id}</td>
    </tr>
  );
}

function PostRow({ post }) {
  return (
    <tr key={post.id}>
      <td><div className="detail-post-main"><span className="detail-strong">{shorten(post.content)}</span><span className="detail-post-subtle">Media: {post?.media?.[0]?.type || "video"}</span><span className="detail-post-subtle">Origin: {post?.origin || "-"}</span></div></td>
      <td>{formatDate(post.publish_at)}</td>
      <td className="detail-mono">{post.id}</td>
    </tr>
  );
}

export default function DetailTable(props) {
  const { filteredRows, isAccountsView } = props;
  return (
    <section className="detail-table-card">
      <table className="detail-table">
        <thead>{isAccountsView ? <tr><th>Username</th><th>Platform</th><th>Status</th><th>ID</th></tr> : <tr><th>Content</th><th>Publish at</th><th>ID</th></tr>}</thead>
        <tbody>
          {!filteredRows.length ? <EmptyRow isAccountsView={isAccountsView} /> : null}
          {isAccountsView ? filteredRows.map((account) => <AccountRow key={account.id} account={account} />) : filteredRows.map((post) => <PostRow key={post.id} post={post} />)}
        </tbody>
      </table>
    </section>
  );
}
