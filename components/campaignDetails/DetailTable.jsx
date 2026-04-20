import StatusPill from "@/components/campaignDetails/StatusPill";
import { formatDate, shorten, toDateTimeInputValue } from "@/components/campaignDetails/utils";

export default function DetailTable({
  filteredRows,
  inlineSavingId,
  isAccountsView,
  metric,
  publishDrafts,
  deletingPostId,
  onDeleteQueuedPost,
  onOpenPostEditor,
  onPublishDraftChange,
  onSaveInlinePublishAt,
}) {
  return (
    <section className="detail-table-card">
      <table className="detail-table">
        <thead>{isAccountsView ? <tr><th>Username</th><th>Platform</th><th>Status</th><th>ID</th></tr> : <tr><th>Content</th><th>Status</th><th>Targets</th><th>Publish at</th><th>Created</th><th>ID</th>{metric === "queuedPosts" ? <th>Actions</th> : null}</tr>}</thead>
        <tbody>
          {!filteredRows.length ? <tr><td colSpan={isAccountsView ? 4 : metric === "queuedPosts" ? 7 : 6} className="detail-empty">Nothing matches your filters yet.</td></tr> : null}
          {isAccountsView ? filteredRows.map((account) => <tr key={account.id}><td className="detail-strong">{account.username || "—"}</td><td>{account.platform || "—"}</td><td><StatusPill value={account.status} /></td><td className="detail-mono">{account.id}</td></tr>) : filteredRows.map((post) => (
            <tr key={post.id}>
              <td><div className="detail-post-main"><span className="detail-strong">{shorten(post.content)}</span><span className="detail-post-subtle">External ID: {post?.external_id || "—"}</span><span className="detail-post-subtle">Origin: {post?.origin || "—"}</span></div></td>
              <td><div className="detail-post-main"><StatusPill value={post.status} /><span className="detail-post-subtle">Media: {post?.media?.[0]?.type || "video"}</span></div></td>
              <td className="detail-targets-cell">{Array.isArray(post?.targets) && post.targets.length ? post.targets.map((target, index) => <div key={`${post.id}-target-${index}`} className="detail-target-pill"><span>{target?.username || target?.account_id || "unknown"}</span><span>{target?.platform || "—"}</span><span>{target?.status || "pending"}</span></div>) : <span className="detail-post-subtle">No targets</span>}</td>
              <td>{metric === "queuedPosts" ? <div className="detail-inline-date-editor"><input className="detail-inline-date-input" type="datetime-local" value={publishDrafts[post.id] || toDateTimeInputValue(post.publish_at)} onChange={(event) => onPublishDraftChange(post.id, event.target.value)} /><button type="button" className="detail-inline-save-button" onClick={() => onSaveInlinePublishAt(post.id)} disabled={inlineSavingId === post.id} aria-label="Save publish time">{inlineSavingId === post.id ? "..." : "Save"}</button></div> : formatDate(post.publish_at)}</td>
              <td>{formatDate(post.created_at)}</td>
              <td className="detail-mono">{post.id}</td>
              {metric === "queuedPosts" ? <td><div className="detail-row-actions"><button type="button" className="detail-row-icon-button" onClick={() => onOpenPostEditor(post)} aria-label="Edit queued post" title="Edit queued post"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg></button><button type="button" className="detail-row-icon-button detail-row-icon-button-danger" onClick={() => onDeleteQueuedPost(post.id)} disabled={deletingPostId === post.id} aria-label="Delete queued post" title="Delete queued post"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg></button></div></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
