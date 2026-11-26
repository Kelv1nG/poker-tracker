import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { usePoll } from '../../api/usePoll';
import { HandDetails } from './HandDetails';

export function HandsPage() {
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[table,setTable]=useState('');
  const [filters,setFilters]=useState({from:'',to:'',table_name:''});
  const [cursors,setCursors]=useState<(string|null)[]>([null]);const cursor=cursors.at(-1)??null;
  const [selected,setSelected]=useState<{source:string;id:string}|null>(null);
  const [validation,setValidation]=useState<string|null>(null);
  const {data,error,loading,reload}=usePoll(async signal=>{
    const [hands,imports]=await Promise.all([api.hands({...filters,cursor},signal),api.imports(null,signal)]);
    const revision=JSON.stringify(imports.items.filter(job=>job.status!=='queued'&&job.status!=='processing').map(job=>[job.job_id,job.status,job.counts]))+hands.total;
    return {hands,revision};
  },[filters.from,filters.to,filters.table_name,cursor]);
  const observedRevision=useRef<string|null>(null);
  useEffect(()=>{
    if(data&&observedRevision.current!==data.revision){
      if(observedRevision.current!==null)setCursors([null]);
      observedRevision.current=data.revision;
    }
  },[data]);
  return <>
    <div className="page-heading"><div><h1>Hands</h1><p className="muted">Browse the hands you have imported.</p></div>{data&&<span className="library-count">{data.hands.total.toLocaleString()} hands</span>}</div>
    <form className="panel hand-filters" onSubmit={event=>{event.preventDefault();setValidation(null);
      if(from&&to&&from>to){setValidation('From must be earlier than or equal to To.');return;}
      setFilters({from,to,table_name:table});setCursors([null]);setSelected(null);reload();}}>
      <div className="form-grid"><label>From (printed time)<input type="datetime-local" step={60} value={from} onChange={e=>setFrom(e.target.value)} /></label>
        <label>To (printed time)<input type="datetime-local" step={60} value={to} onChange={e=>setTo(e.target.value)} /></label>
        <label>Table name<input value={table} onChange={e=>setTable(e.target.value)} placeholder="Exact table name" /></label></div>
      <div className="button-row"><button type="submit">Apply filters</button><button type="button" onClick={()=>{setFrom('');setTo('');setTable('');setFilters({from:'',to:'',table_name:''});setCursors([null]);setSelected(null);setValidation(null);reload();}}>Clear filters</button></div>
      <p className="muted helper">Dates use the time printed in the hand history, without timezone conversion.</p>
    </form>
    {validation&&<p role="alert" className="error">{validation}</p>}{error&&<p role="alert" className="error">{error} <button onClick={reload}>Try again</button></p>}
    {!data&&!error&&<p role="status">Loading hands…</p>}
    {data&&<>
      {data.hands.items.length?<div className="table-scroll"><table><thead><tr><th>Started (printed)</th><th>Table</th><th className="numeric">Players</th><th>Hand</th></tr></thead><tbody>{data.hands.items.map(hand=><tr key={`${hand.source_id}:${hand.hand_id}`} aria-selected={selected?.id===hand.hand_id&&selected?.source===hand.source_id}>
        <td className="date-cell">{hand.started_at_local.replace('T',' ')}</td><td><button className="text-button" aria-label={`Open ${hand.table_name} hand ${hand.hand_id}`} onClick={()=>setSelected({source:hand.source_id,id:hand.hand_id})}>{hand.table_name}</button></td><td className="numeric">{hand.player_count}</td><td className="muted small">{hand.hand_id.slice(-8)}</td>
      </tr>)}</tbody></table></div>:<div className="empty"><h2>No hands found</h2><p className="muted">Import a JSON export or adjust the printed-time filters.</p><a href="#imports">Go to Imports</a></div>}
      {(cursors.length>1||data.hands.next_cursor)&&<div className="pagination"><button disabled={loading||cursors.length===1} onClick={()=>setCursors(old=>old.slice(0,-1))}>Previous hands</button><button disabled={loading||!data.hands.next_cursor} onClick={()=>setCursors(old=>[...old,data.hands.next_cursor])}>Next hands</button></div>}
    </>}
    {selected&&<HandDetails key={`${selected.source}:${selected.id}`} source={selected.source} id={selected.id} onClose={()=>setSelected(null)} />}
  </>;
}
