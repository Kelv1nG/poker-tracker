import { useState } from 'react';
import type { HandReview, UnitReport } from '../../api/contracts';

function netDisplay(value:string,symbol:string|null) {
  const negative=value.startsWith('-'),absolute=negative?value.slice(1):value;
  const [whole,fraction='']=absolute.split('.');
  const decimals=fraction.replace(/0+$/,'').padEnd(2,'0');
  const sign=/^0(?:\.0*)?$/.test(absolute)?'':negative?'−':'+';
  return `${sign}${symbol??''}${whole}.${decimals}`;
}

export function ReviewTotals({review,total,hasPlayer}:{review:HandReview|null|undefined;total:number;hasPlayer:boolean}) {
  return <div className="review-totals">
    <section className="panel review-metric" role="group" aria-label="Matching hands"><span className="muted">Matching hands</span><strong>{total.toLocaleString()}</strong><span className="muted helper">All matching hands, across every page</span></section>
    <section className="panel review-metric" role="group" aria-label="Total net won"><span className="muted">Total net won</span>
      {!hasPlayer?<p className="muted helper">Select a player and apply filters.</p>:!review?<p className="muted helper">Report unavailable</p>:!review.totals.length?<p className="muted helper">No matching results</p>:review.totals.map(unit=><div key={unit.unit} className="unit-net"><strong className={unit.net_won.startsWith('-')?'negative':'positive'}>{netDisplay(unit.net_won,unit.currency_symbol)}</strong><span className="muted helper">{unit.label} · {unit.hand_count.toLocaleString()} hands</span></div>)}
    </section>
  </div>;
}

export function PositionSummary({review,selectedPosition,onPosition}:{review:HandReview|null|undefined;selectedPosition:string;onPosition:(position:string,unit?:string)=>void}) {
  const [advanced,setAdvanced]=useState(false);
  const multi=(review?.all_positions.length??0)>1;
  function net(row:UnitReport){return <span className={row.net_won.startsWith('-')?'negative':'positive'}>{netDisplay(row.net_won,row.currency_symbol)}</span>;}
  return <section className="position-summary" aria-label="Position summary">
    <div className="section-top"><h2>By position</h2><span className="muted small">Select a row</span></div>
    <label className="checkbox-label small"><input type="checkbox" checked={advanced} onChange={e=>setAdvanced(e.target.checked)}/>Show VPIP and PFR</label>
    {!review?<p className="muted helper">Position summary unavailable.</p>:!review.all_positions.length?<p className="muted helper">No matching positions.</p>:review.all_positions.map(unit=>{
      const rows=review.positions.filter(row=>row.unit===unit.unit);
      return <div className="position-unit" key={unit.unit}><p className="muted small unit-label">{unit.label}</p><div className="table-scroll"><table aria-label={`Positions · ${unit.label}`}><thead><tr><th scope="col">Position</th><th scope="col" className="numeric">Hands</th><th scope="col" className="numeric">Net won</th><th scope="col" className="numeric">bb/100</th>{advanced&&<><th scope="col" className="numeric">VPIP</th><th scope="col" className="numeric">PFR</th></>}</tr></thead><tbody>
        {[{...unit,position:''},...rows].map(row=><tr key={row.position} aria-selected={selectedPosition===row.position}>
          <td><button className="text-button" aria-label={row.position?`Filter position ${row.position}${multi?' in '+unit.label:''}`:multi?`All positions in ${unit.label}`:'All positions'} aria-pressed={selectedPosition===row.position} onClick={()=>onPosition(row.position,multi?unit.unit:undefined)}>{row.position==='UNKNOWN'?'Unknown':row.position||'All positions'}</button></td>
          <td className="numeric" title={`${row.dealt_hands} confirmed dealt hands`}>{row.hand_count.toLocaleString()}</td><td className="numeric">{net(row)}</td>
          <td className="numeric" title={`${row.bb_hands} of ${row.dealt_hands} dealt hands with established BB; 100 × average net / BB`}>{row.bb100??'—'}</td>
          {advanced&&<><td className="numeric" title={`${row.vpip_hands} voluntary preflop / ${row.preflop_hands} reliable dealt hands`}>{row.vpip==null?'—':row.vpip+'%'}</td><td className="numeric" title={`${row.pfr_hands} raised preflop / ${row.preflop_hands} reliable dealt hands`}>{row.pfr==null?'—':row.pfr+'%'}</td></>}
        </tr>)}
      </tbody></table></div></div>;
    })}
    <p className="muted helper">Comparisons use all applied filters except position. SB includes the HU button. Unknown stays separate.</p>
    <p className="muted helper">Rates exclude uncertain participation or blinds where needed. Hover a rate to see its coverage.</p>
  </section>;
}
