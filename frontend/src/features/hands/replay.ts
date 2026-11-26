import type { Card, HandEvent, HandPayload } from '../../api/contracts';

export interface ReplayFrame { phaseName:string; phaseIndex:number; event:HandEvent }
export interface ReplayPlayer { name:string; startingBalance:string; cards:Card[]; folded:boolean; role:'SB'|'BB'|null; dealt:boolean }
export interface ReplayBoard { label:string; cards:Card[] }
export interface ReplayState { step:number; finished:boolean; current:ReplayFrame|null; players:ReplayPlayer[]; boards:ReplayBoard[] }

export function replayFrames(payload:HandPayload):ReplayFrame[] {
  return payload.phases.flatMap((phase,phaseIndex)=>{
    const events:HandEvent[]=[...phase.events];
    if(phase.board.length&&!events.some(event=>event.type==='board')) {
      events.unshift({type:'board',board:phase.board,new_cards:phase.new_cards});
    }
    if(!events.length)events.push({type:'system',player:null,action:`${phase.name} · no recorded events`,action_code:null,amount:null,cards:[]});
    return events.map(event=>({phaseName:phase.name,phaseIndex,event}));
  });
}

export function replaySnapshot(payload:HandPayload,frames:ReplayFrame[],requestedStep:number):ReplayState {
  const step=Number.isFinite(requestedStep)?Math.max(0,Math.min(frames.length,Math.floor(requestedStep))):0;
  const players:ReplayPlayer[]=payload.players.map(p=>({name:p.name,startingBalance:p.starting_balance,cards:[],folded:false,role:null,dealt:false}));
  const byName=new Map(players.map(p=>[p.name,p]));
  const boards:ReplayBoard[]=[];
  for(const {event} of frames.slice(0,step)) {
    if(event.type==='board') {
      if(!event.board.length)continue;
      const previous=boards.at(-1);
      const same=previous&&event.board.length===previous.cards.length&&event.board.every((card,i)=>card===previous.cards[i]);
      const extendsPrevious=previous&&event.board.length>previous.cards.length&&previous.cards.every((card,i)=>card===event.board[i]);
      if(extendsPrevious)previous.cards=[...event.board];
      else if(!same)boards.push({label:`Board ${boards.length+1}`,cards:[...event.board]});
      continue;
    }
    const player=event.player?byName.get(event.player):undefined;
    if(!player)continue;
    if(event.action_code==='SMALL_BLIND')player.role='SB';
    if(event.action_code==='BIG_BLIND')player.role='BB';
    if(event.action_code==='FOLD')player.folded=true;
    if(event.cards.length===2&&(event.action==='Was dealt'||event.action==='Showing Pocket Cards'||event.action_code==='SHOW_CARDS')) {
      player.cards=event.cards.map((card,i)=>card??player.cards[i]??null);
      if(event.action==='Was dealt')player.dealt=true;
    }
  }
  return {step,finished:step===frames.length,current:frames[step-1]??null,players,boards};
}
