import { replayFrames, replaySnapshot } from './replay';
import twice from '../../../../backend/tests/fixtures/bet88/run-it-twice.json';
import preflop from '../../../../backend/tests/fixtures/bet88/preflop.json';
import type { HandPayload } from '../../api/contracts';

const early=preflop as HandPayload, rit=twice as HandPayload;

test('cards and folds appear only at their source event and disappear on rewind',()=>{
  const frames=replayFrames(early);
  expect(frames).toHaveLength(8);
  expect(replaySnapshot(early,frames,2).players.find(p=>p.name==='Tassadar')?.cards).toEqual([]);
  expect(replaySnapshot(early,frames,3).players.find(p=>p.name==='Tassadar')?.cards).toEqual(['Ad','7d']);
  expect(replaySnapshot(early,frames,4).players.find(p=>p.name==='Due Date')?.cards).toEqual([null,null]);
  expect(replaySnapshot(early,frames,7).players.find(p=>p.name==='Due Date')?.folded).toBe(true);
  expect(replaySnapshot(early,frames,6).players.find(p=>p.name==='Due Date')?.folded).toBe(false);
  expect(replaySnapshot(early,frames,7).finished).toBe(false);
  expect(replaySnapshot(early,frames,8).finished).toBe(true);
});

test('run-it-twice preserves both observed boards and delayed private reveals',()=>{
  const frames=replayFrames(rit);
  const firstReveal=frames.findIndex(f=>f.event.type!=='board'&&f.event.player==='GlidingMetal'&&f.event.action==='Showing Pocket Cards');
  expect(replaySnapshot(rit,frames,firstReveal).players.find(p=>p.name==='GlidingMetal')?.cards).toEqual([null,null]);
  expect(replaySnapshot(rit,frames,firstReveal+1).players.find(p=>p.name==='GlidingMetal')?.cards).toEqual(['9d','9s']);
  const last=replaySnapshot(rit,frames,frames.length);
  expect(last.boards.map(b=>b.cards)).toEqual([['5d','Kh','2d','Tc','8s'],['Jh','7h','Td','5h','4s']]);
  expect(last.players.find(p=>p.name==='Tassadar')?.cards).toEqual(['As','Kd']);
  const firstRiver=frames.findIndex(f=>f.phaseName==='River');
  expect(replaySnapshot(rit,frames,firstRiver+1).boards.map(b=>b.cards)).toEqual([['5d','Kh','2d','Tc','8s']]);
  expect(replaySnapshot(rit,frames,0).boards).toEqual([]);
});

test('phase-only boards are framed once and final results never become private cards',()=>{
  const hand=structuredClone(early);
  hand.phases[0].events=hand.phases[0].events.filter(e=>e.type==='board'||e.action!=='Was dealt');
  hand.phases.push({name:'Flop',board:['2c','3d','4h'],new_cards:['2c','3d','4h'],events:[]});
  const before=JSON.stringify(hand);
  const frames=replayFrames(hand);
  const last=replaySnapshot(hand,frames,frames.length);
  expect(last.boards[0].cards).toEqual(['2c','3d','4h']);
  expect(last.players.find(p=>p.name==='Tassadar')?.cards).toEqual([]);
  expect(JSON.stringify(hand)).toBe(before);
  expect(replayFrames(rit).filter(f=>f.event.type==='board')).toHaveLength(6);
});

test('explicit blind roles are revealed as posts occur and steps stay bounded',()=>{
  const frames=replayFrames(early);
  expect(replaySnapshot(early,frames,-20).step).toBe(0);
  expect(replaySnapshot(early,frames,500).step).toBe(8);
  expect(replaySnapshot(early,frames,0).players.every(p=>p.role===null)).toBe(true);
  expect(replaySnapshot(early,frames,2).players.map(p=>p.role)).toEqual(['SB','BB']);
});
