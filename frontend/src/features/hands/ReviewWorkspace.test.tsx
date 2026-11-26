import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandsPage } from './HandsPage';
import early from '../../../../backend/tests/fixtures/bet88/preflop.json';
import twice from '../../../../backend/tests/fixtures/bet88/run-it-twice.json';

function setup({mixed=false,empty=false}={}) {
  const requests:URLSearchParams[]=[];
  const unit={unit:'dollars',label:'Displayed $ (currency unset)',currency_code:null as string|null,currency_symbol:'$',dealt_hands:2,preflop_hands:2,vpip_hands:2,pfr_hands:2,bb_hands:2,bb100:'120.00',vpip:'100.00',pfr:'100.00'};
  const all={...unit,hand_count:2,net_won:'0.19000000'};
  const bb={...unit,position:'BB',hand_count:1,net_won:'0.05000000'};
  const co={...unit,position:'CO',hand_count:1,net_won:'0.14000000'};
  vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
    const u=new URL(String(input),'http://localhost');
    if(u.pathname==='/api/settings')return Response.json({hero_name:'Tassadar'});
    if(u.pathname==='/api/hand-options')return Response.json({players:['Tassadar'],units:[{value:'dollars',label:unit.label},...(mixed?[{value:'peso',label:'PHP (₱)'}]:[])],stakes:[]});
    if(u.pathname==='/api/imports')return Response.json({items:[],total:0,next_cursor:null});
    if(u.pathname==='/api/hands') {
      requests.push(u.searchParams);
      const filtered=u.searchParams.get('position')==='BB';
      const payload=filtered?early:twice;
      const review={player:'Tassadar',totals:empty?[]:[filtered?bb:all],all_positions:empty?[]:[all],positions:empty?[]:[bb,co]};
      if(mixed) {const php={...all,unit:'peso',label:'PHP (₱)',currency_code:'PHP',currency_symbol:'₱',net_won:'10.00000000',hand_count:1};review.totals.push(php);review.all_positions.push(php);review.positions.push({...php,position:'BB'});}
      return Response.json({total:empty?0:filtered?1:2,next_cursor:null,review,items:empty?[]:[{source_id:'bet88',hand_id:payload.id,table_name:payload.table_name,started_at_local:payload.started_at,player_count:payload.players.length,player:'Tassadar',hole_cards:[],boards:[],action_line:[]}]});
    }
    if(u.pathname.startsWith('/api/hands/')) {
      const payload=u.pathname.endsWith(early.id)?early:twice;
      return Response.json({source_id:'bet88',hand_id:payload.id,table_name:payload.table_name,started_at_local:payload.started_at,payload,quality_flags:[],source_timezone:null,currency_code:null,provenance:[]});
    }
    throw new Error(String(input));
  }));
  return {requests,user:userEvent.setup()};
}

test('shows global totals and drills into position without applying unrelated drafts',async()=>{
  const {requests,user}=setup();render(<HandsPage/>);
  const total=await screen.findByRole('group',{name:'Total net won'});
  expect(within(total).getByText('+$0.19')).toBeInTheDocument();
  expect(requests.at(-1)?.get('with_review')).toBe('true');
  await user.type(screen.getByLabelText('Table name'),'Pending table');
  await user.click(screen.getByRole('button',{name:'Filter position BB'}));
  await waitFor(()=>expect(requests.at(-1)?.get('position')).toBe('BB'));
  await waitFor(()=>expect(within(screen.getByRole('group',{name:'Total net won'})).getByText('+$0.05')).toBeInTheDocument());
  expect(screen.getByRole('button',{name:'Filter position CO'})).toBeInTheDocument();
  expect(screen.getByLabelText('Table name')).toHaveValue('Pending table');
  expect(requests.at(-1)?.has('table_name')).toBe(false);
  await user.click(screen.getByRole('button',{name:'All positions'}));
  await waitFor(()=>expect(requests.at(-1)?.has('position')).toBe(false));
});

test('mixed-unit totals stay separate and rate columns can be expanded',async()=>{
  const {user}=setup({mixed:true});render(<HandsPage/>);
  const total=await screen.findByRole('group',{name:'Total net won'});
  expect(within(total).getByText('+$0.19')).toBeInTheDocument();
  expect(within(total).getByText('+₱10.00')).toBeInTheDocument();
  expect(within(total).queryByText(/10\.19/)).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('Show VPIP and PFR'));
  expect(screen.getAllByRole('columnheader',{name:'VPIP'})).toHaveLength(2);
  expect(screen.getAllByRole('columnheader',{name:'PFR'})).toHaveLength(2);
});

test('mixed-unit position drill changes only position and preserves the pending unit',async()=>{
  const {requests,user}=setup({mixed:true});render(<HandsPage/>);
  await screen.findByRole('button',{name:'Filter position BB in Displayed $ (currency unset)'});
  await user.click(screen.getByText('More filters'));
  await user.selectOptions(screen.getByLabelText('Money unit'),'peso');
  await user.click(screen.getByRole('button',{name:'Filter position BB in Displayed $ (currency unset)'}));
  await waitFor(()=>expect(requests.at(-1)?.get('position')).toBe('BB'));
  expect(requests.at(-1)?.has('unit')).toBe(false);
  expect(screen.getByLabelText('Money unit')).toHaveValue('peso');
});

test('selection opens replay before full history and an empty result has no stale net',async()=>{
  const {user}=setup();render(<HandsPage/>);
  await user.click(await screen.findByRole('button',{name:/Open Apple Valley hand/}));
  const replay=await screen.findByRole('region',{name:'Hand replay'});
  expect(within(replay).getByRole('slider',{name:'Replay step'})).toHaveValue('0');
  expect(within(replay).queryByRole('img',{name:'4 of spades'})).not.toBeInTheDocument();
  await user.click(screen.getByText('Full hand history and sources'));
  expect(screen.getByRole('region',{name:'Table Cards Dealt 7'})).toBeVisible();
});

test('empty report is explicit instead of showing an unrelated total',async()=>{
  setup({empty:true});render(<HandsPage/>);
  await screen.findByText('No hands found');
  expect(screen.getByRole('group',{name:'Total net won'})).toHaveTextContent('No matching results');
});
