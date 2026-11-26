import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { HandFilters, HandSummary } from '../../api/contracts';
import { usePoll } from '../../api/usePoll';
import { HandDetails } from './HandDetails';
import { Cards } from './Cards';

const defaults=(player='')=>({player,include_not_dealt:false,from:'',to:'',table_name:'',game_type:'',result:'',position:'',action:'',street:'',net_min:'',net_max:'',unit:'',stake:'',sort:'date_desc'});
type Draft=ReturnType<typeof defaults>;
const compact=(value:string|null|undefined)=>value==null?'?':value.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');

export function HandsPage() {
  const settings=usePoll(signal=>api.settings(signal),[],0);
  if(!settings.data)return settings.error?<p role="alert" className="error">{settings.error} <button onClick={settings.reload}>Try again</button></p>:<p role="status">Loading hands…</p>;
  return <HandBrowser initialPlayer={settings.data.hero_name??''}/>;
}

function HandBrowser({initialPlayer}:{initialPlayer:string}) {
  const [draft,setDraft]=useState(()=>defaults(initialPlayer));
  const [filters,setFilters]=useState<Draft>(()=>defaults(initialPlayer));
  const [cursors,setCursors]=useState<(string|null)[]>([null]);const cursor=cursors.at(-1)??null;
  const [selected,setSelected]=useState<{source:string;id:string}|null>(null);
  const [validation,setValidation]=useState<string|null>(null);
  const options=usePoll(async signal=>({...(await api.handOptions(draft.player,signal)),player:draft.player}),[draft.player],0);
  const available=options.data?.player===draft.player?options.data:null;
  const {data,error,loading,reload}=usePoll(async signal=>{
    const [hands,imports]=await Promise.all([api.hands({...filters,cursor} satisfies HandFilters,signal),api.imports(null,signal)]);
    const revision=JSON.stringify(imports.items.filter(job=>job.status!=='queued'&&job.status!=='processing').map(job=>[job.job_id,job.status,job.counts]))+hands.total;
    return {hands,revision};
  },[JSON.stringify(filters),cursor]);
  const observedRevision=useRef<string|null>(null);
  useEffect(()=>{
    if(data&&observedRevision.current!==data.revision){
      if(observedRevision.current!==null)setCursors([null]);
      observedRevision.current=data.revision;
    }
  },[data]);
  function field<K extends keyof Draft>(key:K,value:Draft[K]){setDraft(old=>({...old,[key]:value,...(key==='action'&&!value?{street:''}:{})}));}
  const actor=Boolean(draft.player);
  function select(label:string,key:keyof Draft,choices:[string,string][],disabled=false) {
    return <label>{label}<select value={String(draft[key])} disabled={disabled} onChange={e=>field(key,e.target.value as never)}>{choices.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>;
  }
  function apply(event:React.SubmitEvent<HTMLFormElement>){
    event.preventDefault();setValidation(null);
    if(draft.from&&draft.to&&draft.from>draft.to){setValidation('From must be earlier than or equal to To.');return;}
    if(actor&&(draft.net_min||draft.net_max||draft.sort.startsWith('net_'))&&!draft.unit&&(available?.units.length??0)>1){setValidation('Select a money unit before numeric bounds or money sorting.');return;}
    setFilters({...draft});setCursors([null]);setSelected(null);reload();
  }
  return <>
    <div className="page-heading"><div><h1>Hands</h1><p className="muted">{filters.player?<>Reviewing <strong>{filters.player}</strong></>:'Select a player to see cards, results and betting lines.'}</p></div>{data&&<span className="library-count">{data.hands.total.toLocaleString()} hands</span>}</div>
    <form className="panel hand-filters" onSubmit={apply}>
      <div className="form-grid">
        <label>Player<input list="hand-players" value={draft.player} placeholder="All hands · type an exact name" onChange={e=>setDraft(old=>({...defaults(e.target.value),from:old.from,to:old.to,table_name:old.table_name,game_type:old.game_type}))}/><datalist id="hand-players">{available?.players.map(name=><option key={name} value={name}/>)}</datalist></label>
        {select('Game type','game_type',[['','All games'],['HU','Heads-up'],['MULTIWAY','Multiway'],['UNKNOWN','Unknown']])}
        {select('Result','result',[['','Any result'],['won','Won'],['lost','Lost'],['breakeven','Breakeven']],!actor)}
        {select('Position','position',[['','Any position'],['SB','SB (HU button included)'],['BB','BB'],['BTN','BTN (3+ players)'],['CO','CO'],['HJ','HJ (MP)'],['UTG','UTG (EP)'],['UNKNOWN','Unknown']],!actor)}
        {select('Stakes','stake',[['','All stakes'],['UNKNOWN','Unknown nominal stakes'],...(available?.stakes??[]).map(s=>[s.value,`${s.label} · ${available?.units.find(u=>u.value===s.unit)?.label??'unit unset'}`] as [string,string])])}
        {select('Player action','action',[['','Any action'],['RAISE','Raise'],['CALL','Call'],['BET','Bet'],['CHECK','Check'],['FOLD','Fold']],!actor)}
      </div>
      <label className="checkbox-label"><input type="checkbox" checked={draft.include_not_dealt} disabled={!actor} onChange={e=>field('include_not_dealt',e.target.checked)}/>Include listed players who were not dealt in (also includes unknown participation)</label>
      <details className="extra-filters"><summary>More filters</summary><div className="form-grid">
        <label>From (printed time)<input type="datetime-local" step={60} value={draft.from} onChange={e=>field('from',e.target.value)}/></label>
        <label>To (printed time)<input type="datetime-local" step={60} value={draft.to} onChange={e=>field('to',e.target.value)}/></label>
        <label>Table name<input value={draft.table_name} onChange={e=>field('table_name',e.target.value)} placeholder="Exact table name"/></label>
        {select('Street','street',[['','Any street'],['Preflop','Preflop'],['Flop','Flop'],['Turn','Turn'],['River','River']],!actor||!draft.action)}
        {select('Sort','sort',[['date_desc','Date · newest first'],['date_asc','Date · oldest first'],...(actor?[['net_desc','Net won · highest first'],['net_asc','Net won · lowest first']] as [string,string][]:[])])}
        {select('Money unit','unit',[['',available?.units.length===1?available.units[0].label:'Choose a unit for money comparisons'],...(available?.units??[]).map(u=>[u.value,u.label] as [string,string])],!actor)}
        <label>Minimum net<input inputMode="decimal" disabled={!actor} placeholder="e.g. -5.00" value={draft.net_min} onChange={e=>field('net_min',e.target.value)}/></label>
        <label>Maximum net<input inputMode="decimal" disabled={!actor} placeholder="e.g. 10.00" value={draft.net_max} onChange={e=>field('net_max',e.target.value)}/></label>
      </div><p className="muted helper">Dates use printed hand-history time. Money bounds are inclusive and use exact source amounts; units are never converted.</p></details>
      <div className="button-row"><button type="submit" className="primary">Apply filters</button><button type="button" onClick={()=>{setDraft(defaults(initialPlayer));setFilters(defaults(initialPlayer));setCursors([null]);setSelected(null);setValidation(null);reload();}}>Clear filters</button></div>
      <p className="muted helper">HU counts players dealt cards, including hidden cards. Positions are inferred only where the events support them.</p>
    </form>
    {options.error&&<p role="alert" className="error">Filter options: {options.error} <button onClick={options.reload}>Retry options</button></p>}
    {validation&&<p role="alert" className="error">{validation}</p>}{error&&<p role="alert" className="error">{error} <button onClick={reload}>Try again</button></p>}
    {!data&&!error&&<p role="status">Loading hands…</p>}
    {data&&<>
      {data.hands.items.length?<div className="table-scroll hand-grid" role="region" aria-label="Hand grid, scroll horizontally for all columns" tabIndex={0} aria-busy={loading}><table aria-label="Hand results"><thead><tr>{['Date (printed)','Cards','Preflop','Board','Line','Net won','Position','Blinds','Dealt players','Stack','Table'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{data.hands.items.map(hand=><HandRow key={`${hand.source_id}:${hand.hand_id}`} hand={hand} actor={Boolean(filters.player)} selected={selected?.id===hand.hand_id&&selected?.source===hand.source_id} open={()=>setSelected({source:hand.source_id,id:hand.hand_id})}/>)}</tbody></table></div>:<div className="empty"><h2>No hands found</h2><p className="muted">Import a JSON export or adjust the filters.</p><a href="#imports">Go to Imports</a></div>}
      {(cursors.length>1||data.hands.next_cursor)&&<div className="pagination"><button disabled={loading||cursors.length===1} onClick={()=>setCursors(old=>old.slice(0,-1))}>Previous hands</button><button disabled={loading||!data.hands.next_cursor} onClick={()=>setCursors(old=>[...old,data.hands.next_cursor])}>Next hands</button></div>}
    </>}
    {selected&&<HandDetails key={`${selected.source}:${selected.id}`} source={selected.source} id={selected.id} onClose={()=>setSelected(null)}/>}
  </>;
}

function HandRow({hand:h,actor,selected,open}:{hand:HandSummary;actor:boolean;selected:boolean;open:()=>void}) {
  const uncertain=h.posted_sb!=null&&h.nominal_sb==null||h.posted_bb!=null&&h.nominal_bb==null;
  return <tr aria-selected={selected}>
    <td className="date-cell">{h.started_at_local.replace('T',' ')}</td>
    <td>{actor?<Cards cards={h.hole_cards??[]}/>:<span className="muted">—</span>}</td>
    <td>{actor?h.player_dealt===false?'Not dealt':h.preflop_spot??'Unknown':'—'}</td>
    <td>{(h.boards??[]).length?(h.boards??[]).map((board,i)=><div key={i} className="runout" aria-label={`Board ${i+1}`}><Cards cards={board}/></div>):<span className="muted">—</span>}</td>
    <td>{actor?(h.action_line??[]).map((line,i)=><span className="betting-line" key={i} title={`${line.street}: ${line.description}`}>{line.street} {line.actions.join('')}</span>):'—'}</td>
    <td className={`numeric ${actor&&h.net_result?.startsWith('-')?'negative':actor?'positive':''}`}>{actor?h.net_result_display??'Unknown':'—'}</td>
    <td><span title={actor?h.position_evidence??'Insufficient evidence':undefined}>{actor?h.position==='UNKNOWN'||!h.position?'Unknown':h.position==='SB'&&h.game_type==='HU'?'SB / button':h.position:'—'}</span></td>
    <td title={uncertain?'Posted amounts; nominal stakes uncertain':'Ordinary blind posts'}>{compact(h.posted_sb)} / {compact(h.posted_bb)}{uncertain?' *':''}</td>
    <td title={`${h.player_count} players listed`}>{h.dealt_player_count==null?'Unknown':h.game_type==='HU'?`HU · ${h.dealt_player_count}`:`${h.dealt_player_count}-handed`}</td>
    <td className="numeric">{actor?h.starting_balance_display??'Unknown':'—'}</td>
    <td><button className="text-button" aria-label={`Open ${h.table_name} hand ${h.hand_id}`} onClick={open}>{h.table_name}</button></td>
  </tr>;
}
