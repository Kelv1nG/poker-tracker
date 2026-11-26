import { useRef, useState } from 'react';
import { api, message } from '../../api/client';
import { usePoll } from '../../api/usePoll';
import type { JobStatus, UserSettings } from '../../api/contracts';
import { SourceSettings } from '../settings/SourceSettings';
import { JobDetails } from './JobDetails';

const statuses:Record<JobStatus,string>={queued:'Queued',processing:'Importing',completed:'Imported',completed_with_errors:'Imported with issues',failed:'Failed'};

export function ImportsPage() {
  const [cursors,setCursors]=useState<(string|null)[]>([null]);const cursor=cursors.at(-1)??null;
  const {data,error,loading,reload}=usePoll(async signal=>{
    const [history,settings,watcher]=await Promise.all([api.imports(cursor,signal),api.settings(signal),api.watcher(signal)]);
    return {history,settings,watcher};
  },[cursor]);
  const [path,setPath]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);const [actionError,setActionError]=useState<string|null>(null);const [notice,setNotice]=useState('');
  const [selected,setSelected]=useState<string|null>(null); const input=useRef<HTMLInputElement>(null);
  async function changeSettings(patch:Partial<UserSettings>){
    setBusy(true);setActionError(null);setNotice('');
    try {const saved=await api.saveSettings(patch);setPath(saved.watch_path);reload();}
    catch(error){setActionError(message(error));}finally{setBusy(false);}
  }
  return <>
    <div className="page-heading"><div><h1>Imports</h1><p className="muted">Add hand histories or collect new exports automatically.</p></div>
      <button className="primary" disabled={busy} onClick={()=>input.current?.click()}>Import JSON</button>
      <input ref={input} className="visually-hidden" type="file" aria-label="Import JSON file" accept=".json,application/json" onChange={async event=>{
        const file=event.target.files?.[0];event.target.value='';if(!file)return;
        setActionError(null);setNotice('');if(!file.name.toLowerCase().endsWith('.json')){setActionError('Choose a JSON export file.');return;}
        setBusy(true);try{await api.upload(file);setCursors([null]);reload();setNotice('Import queued. Results will update automatically.');}
        catch(error){setActionError(message(error));}finally{setBusy(false);}
      }} />
    </div>
    {error&&<p role="alert" className="error">{error} <button onClick={reload}>Try again</button></p>}
    {actionError&&<p role="alert" className="error">{actionError}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
    {!data&&!error&&<p role="status">Loading imports…</p>}
    {data&&<>
      <section className="panel watcher" aria-label="Automatic import">
        <div className="section-top"><h2>Automatic import</h2><span className={`watch-state ${data.watcher.state}`}>{data.watcher.state==='paused'?'Paused':data.watcher.state==='error'?'Needs attention':'Watching'}</span></div>
        <form onSubmit={event=>{event.preventDefault();void changeSettings({watch_path:path??data.settings.watch_path,watch_enabled:!data.settings.watch_enabled});}}>
          <label htmlFor="watch-path">Watch folder</label><div className="watch-controls"><input id="watch-path" value={path??data.settings.watch_path} onChange={e=>setPath(e.target.value)} spellCheck={false} autoComplete="off" />
            {path!==null&&path!==data.settings.watch_path&&<button type="button" disabled={busy} onClick={()=>void changeSettings({watch_path:path})}>Save folder</button>}
            <button type="submit" disabled={busy}>{data.settings.watch_enabled?'Pause watching':'Start watching'}</button></div>
        </form>
        <p className="muted helper">Checks for new JSON files while the application is running.</p>
        {data.watcher.error&&<p role="alert" className="error">{data.watcher.error}</p>}
        {data.settings.watch_enabled&&<button className="text-button" disabled={busy} onClick={async()=>{try{await api.rescan();setNotice('Rescan scheduled. Files still need to be stable.');}catch(error){setActionError(message(error));}}}>Rescan now</button>}
      </section>
      <section aria-labelledby="history-heading"><div className="section-top"><h2 id="history-heading">Import history</h2><span className="muted small">{data.history.total.toLocaleString()} attempts</span></div>
        {!data.history.items.length?<div className="empty"><h3>No imports yet</h3><p className="muted">Choose a JSON export to build your hand library.</p></div>:<div className="table-scroll"><table><thead><tr><th>File</th><th className="numeric">New</th><th className="numeric">Duplicates</th><th className="numeric">Rejected</th><th>Status</th></tr></thead>
          <tbody>{data.history.items.map(job=><tr key={job.job_id}><td><button className="text-button filename" aria-expanded={selected===job.job_id} onClick={()=>setSelected(job.job_id)}>{job.filename}</button>
            <span className="row-meta">{job.trigger==='upload'?'Manual upload':job.trigger==='watch'?'Folder import':'Retry'} · {new Date(job.created_at).toLocaleString()}</span>
            {job.source_metadata?.partial&&<span className="row-meta warning">Partial export</span>}</td>
            {(['new','duplicate','rejected'] as const).map(key=><td key={key} className="numeric">{job.status==='queued'||job.status==='processing'||job.status==='failed'?'—':job.counts[key].toLocaleString()}</td>)}
            <td><span className={`status ${job.status}`}>{statuses[job.status]}</span></td></tr>)}</tbody></table></div>}
        {data.history.total>50&&<div className="pagination"><button disabled={loading||cursors.length===1} onClick={()=>setCursors(old=>old.slice(0,-1))}>Previous imports</button><button disabled={loading||!data.history.next_cursor} onClick={()=>setCursors(old=>[...old,data.history.next_cursor])}>Next imports</button></div>}
      </section>
      {selected&&<JobDetails key={selected} id={selected} onRetried={()=>{setCursors([null]);reload();setSelected(null);}} onClose={()=>setSelected(null)} />}
      <p className="muted coverage-note">Imported hands show observed play. A completed export does not guarantee full date coverage.</p>
      <SourceSettings settings={data.settings} onSaved={reload} />
    </>}
  </>;
}
