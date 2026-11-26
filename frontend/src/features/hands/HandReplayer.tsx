import { useEffect, useMemo, useState } from 'react';
import type { HandPayload } from '../../api/contracts';
import { Cards } from './Cards';
import { replayFrames, replaySnapshot, type ReplayPlayer } from './replay';

export function HandReplayer({payload,hero,source=''}:{payload:HandPayload;hero:string|null;source?:string}) {
  return <ReplayHand key={`${source}:${payload.id}`} payload={payload} hero={hero}/>;
}

function ReplayHand({payload,hero}:{payload:HandPayload;hero:string|null}) {
  const frames=useMemo(()=>replayFrames(payload),[payload]);
  const [step,setStep]=useState(0),[playing,setPlaying]=useState(false);
  const state=useMemo(()=>replaySnapshot(payload,frames,step),[payload,frames,step]);
  useEffect(()=>{
    if(!playing)return;
    const timer=setInterval(()=>setStep(old=>Math.min(frames.length,old+1)),1000);
    return ()=>clearInterval(timer);
  },[playing,frames.length]);
  useEffect(()=>{if(step>=frames.length)setPlaying(false);},[step,frames.length]);
  function go(next:number){setPlaying(false);setStep(Math.max(0,Math.min(frames.length,next)));}
  const selected=state.players.find(p=>p.name===hero);
  const others=state.players.filter(p=>p!==selected);
  const current=state.current?.event;
  const action=current?.type==='board'?'Community cards dealt':current?`${current.player??'Table'} · ${current.action}${current.amount!=null?' '+current.amount:''}`:'Ready to replay';
  function player(p:ReplayPlayer) {
    return <div role="group" aria-label={p.name} key={p.name} className={`replay-player ${p.folded?'replay-folded':''}`}>
      <span className="replay-player-name">{p.name}{p.role&&<span className="muted"> · {p.role}</span>}</span>
      <span className="muted small">Starting {p.startingBalance}</span>
      <Cards cards={p.cards.length?p.cards:[null,null]}/>
      {p.folded&&<span className="replay-player-state">Folded</span>}
      {!p.dealt&&!p.cards.length&&<span className="muted small">{state.finished?'No deal recorded':'No cards dealt yet'}</span>}
    </div>;
  }
  return <section className="hand-replayer" aria-label="Hand replay">
    <div className="section-top"><h3>Replay · {payload.table_name}</h3><span className="muted small">Schematic layout</span></div>
    <div className="replay-table">
      <div className="replay-opponents">{others.map(player)}</div>
      <div className="replay-boards">
        <p className="muted small">{state.current?.phaseName??'Before first event'}</p>
        {state.boards.length?state.boards.map(board=><div key={board.label} role="group" aria-label={board.label} className="replay-board"><span className="muted small">{board.label}</span><Cards cards={[...board.cards,...Array(Math.max(0,5-board.cards.length)).fill(null)]}/></div>):<div className="replay-board"><Cards cards={[null,null,null,null,null]}/></div>}
      </div>
      {selected&&<div className="replay-hero">{player(selected)}</div>}
    </div>
    <p className="replay-action" aria-live="polite">{action}</p>
    <div className="replay-controls"><button onClick={()=>go(0)}>Start</button><button disabled={!step} onClick={()=>go(step-1)}>Previous</button>
      <button disabled={!frames.length} onClick={()=>{if(state.finished)setStep(0);setPlaying(old=>!old);}}>{playing?'Pause':'Play'}</button>
      <button disabled={state.finished} onClick={()=>go(step+1)}>Next</button></div>
    <label className="replay-slider">Replay step <span className="numeric">{state.step} / {frames.length}</span><input aria-label="Replay step" type="range" min={0} max={frames.length} step={1} value={state.step} onChange={event=>go(Number(event.target.value))}/></label>
    {state.finished&&<div className="replay-results"><h3>Recorded results</h3>{payload.players.map(p=><p key={p.name}>{p.name}: <span className={p.net_result.startsWith('-')?'negative':'positive'}>{p.net_result}</span></p>)}</div>}
    <p className="muted helper">Cards appear only when dealt or revealed. Starting balances and action amounts are shown as recorded.</p>
  </section>;
}
