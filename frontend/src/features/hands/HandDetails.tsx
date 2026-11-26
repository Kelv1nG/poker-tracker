import { useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { usePoll } from '../../api/usePoll';
import { Cards } from './Cards';
import { HandReplayer } from './HandReplayer';

export function HandDetails({source,id,onClose,hero=null}:{source:string;id:string;onClose:()=>void;hero?:string|null}) {
  const {data:hand,error,reload}=usePoll(signal=>api.hand(source,id,signal),[source,id]);
  const heading=useRef<HTMLHeadingElement>(null),focused=useRef(false);
  useEffect(()=>{if(hand&&!focused.current){heading.current?.focus();focused.current=true;}},[hand]);
  return <section className="hand-detail panel" aria-label="Hand details">
    <div className="section-top"><h2 ref={heading} tabIndex={-1}>Hand details</h2><button onClick={onClose}>Close hand</button></div>
    {error&&<p role="alert" className="error">{error} <button onClick={reload}>Try again</button></p>}
    {!hand&&!error&&<p role="status">Loading hand…</p>}
    {hand&&<>
      <h3>{hand.table_name}</h3><p className="printed-time">{hand.started_at_local.replace('T',' ')} <span className="muted">as printed</span></p>
      <p className="muted small hand-id">{source} · {id}</p>
      <p className="muted small">{hand.source_timezone??'Timezone not configured'} · {hand.currency_code??'Currency not configured'}</p>
      {hand.quality_flags.includes('ambiguous_source_time')&&<p className="warning">This printed time is ambiguous in the configured timezone; no UTC time was assigned.</p>}
      {hand.quality_flags.includes('nonexistent_source_time')&&<p className="warning">This printed time does not exist in the configured timezone; no UTC time was assigned.</p>}
      <HandReplayer payload={hand.payload} hero={hero} source={source}/>
      <details className="full-hand-history"><summary>Full hand history and sources</summary>
      <div className="table-scroll players-table"><table><caption className="visually-hidden">Players and results</caption><thead><tr><th>Player</th><th className="numeric">Starting balance</th><th className="numeric">Net result</th><th>Final hand</th></tr></thead>
        <tbody>{hand.payload.players.map(player=><tr key={player.name}><td>{player.name}</td><td className="numeric">{player.starting_balance}</td><td className={`numeric ${player.net_result.startsWith('-')?'negative':'positive'}`}>{player.net_result}</td><td>{player.final_hand.length?<Cards cards={player.final_hand} />:<span className="muted">—</span>}</td></tr>)}</tbody>
      </table></div>
      <h2 className="events-heading">Hand events</h2>
      {hand.payload.phases.map((phase,index)=><section key={index} className="hand-phase" aria-label={`${phase.name} ${index+1}`}>
        <div className="phase-heading"><h3>{phase.name}</h3><Cards cards={phase.board} /></div>
        <div className="table-scroll"><table><thead className="visually-hidden"><tr><th>Player</th><th>Action</th><th>Amount</th><th>Cards</th></tr></thead><tbody>{phase.events.map((event,eventIndex)=><tr key={eventIndex} className={event.type==='system'?'system-event':undefined}>
          <td>{event.type==='board'||event.player===null?<span className="muted">Table</span>:event.player}</td>
          <td>{event.type==='board'?'Table cards dealt':event.action}</td>
          <td className="numeric">{event.type==='board'?'—':event.amount??'—'}</td>
          <td><Cards cards={event.type==='board'?event.board:event.cards} /></td>
        </tr>)}</tbody></table></div>
      </section>)}
      <details className="provenance"><summary>Source files ({hand.provenance.length})</summary>
        <ul>{hand.provenance.map(link=><li key={`${link.source_hash}:${link.source_index}`}><span className="filename">{link.filenames.join(', ')}</span><span className="row-meta">Record {link.source_index+1}</span>{link.is_conflict&&<p className="warning">Conflicting version rejected. This hand keeps its original imported values.</p>}</li>)}</ul>
      </details>
      </details>
    </>}
  </section>;
}
