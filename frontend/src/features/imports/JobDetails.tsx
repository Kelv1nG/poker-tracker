import { useState } from 'react';
import { api, message } from '../../api/client';
import { usePoll } from '../../api/usePoll';

export function JobDetails({id,onRetried,onClose}:{id:string;onRetried:()=>void;onClose:()=>void}) {
  const [cursors,setCursors]=useState<(string|null)[]>([null]);
  const cursor=cursors.at(-1)??null;
  const {data:job,error,reload}=usePoll(signal=>api.job(id,cursor,signal),[id,cursor]);
  const [busy,setBusy]=useState(false);const [actionError,setActionError]=useState<string|null>(null);
  return <section className="panel details" aria-label="Import details">
    <div className="section-top"><h2>Import details</h2><button onClick={onClose}>Close details</button></div>
    {error&&<p role="alert" className="error">{error} <button onClick={reload}>Try again</button></p>}
    {!job&&!error&&<p role="status">Loading import…</p>}
    {job&&<><p className="filename">{job.filename}</p>
      {job.status==='failed'?<p className="muted">No hands were committed by this attempt.</p>:<p className="muted">{job.counts.new.toLocaleString()} new · {job.counts.duplicate.toLocaleString()} duplicate · {job.counts.rejected.toLocaleString()} rejected</p>}
      {!!job.counts.conflict&&<p className="warning">{job.counts.conflict} conflicting versions. Conflicts are included in rejected; the original hands were kept.</p>}
      {job.source_metadata?.partial&&<p className="warning">Partial export. {job.source_metadata.message||'Capture stopped before completion.'} Observed hands do not prove full date coverage.</p>}
      {job.error&&<p role="alert" className="error">{job.error}</p>}
      {!!job.issues.items.length&&<ul className="issue-list">{job.issues.items.map(issue=><li key={issue.source_index}><strong>Record {issue.source_index+1}</strong><span>{issue.outcome==='conflict'?'Conflict: ':''}{issue.reason}</span></li>)}</ul>}
      {job.issues.total>0&&<div className="pagination"><span className="muted">{job.issues.total} rejected records</span><button disabled={cursors.length===1} onClick={()=>setCursors(old=>old.slice(0,-1))}>Previous issues</button><button disabled={!job.issues.next_cursor} onClick={()=>setCursors(old=>[...old,job.issues.next_cursor])}>Next issues</button></div>}
      <button disabled={busy||job.status==='queued'||job.status==='processing'} onClick={async()=>{setBusy(true);setActionError(null);
        try{await api.retry(id);onRetried();}catch(error){setActionError(message(error));}finally{setBusy(false);}}}>{busy?'Queuing…':'Retry import'}</button>
      {actionError&&<p role="alert" className="error">{actionError}</p>}
    </>}
  </section>;
}
