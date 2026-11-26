import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandsPage } from './HandsPage';

function setup(hero:string|null='Tassadar',mixed=false) {
  const requests:URLSearchParams[]=[];
  vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
    const u=new URL(String(input),'http://localhost');
    if(u.pathname==='/api/settings')return Response.json({hero_name:hero});
    if(u.pathname==='/api/imports')return Response.json({items:[],total:0,next_cursor:null});
    if(u.pathname==='/api/hand-options')return Response.json({players:['Tassadar','궤꼴'],units:[{value:'dollars',label:'Displayed $ (currency unset)'},...(mixed?[{value:'peso',label:'PHP (₱)'}]:[])],stakes:[{value:'micro',unit:'dollars',label:'0.02 / 0.05'}]});
    if(u.pathname==='/api/hands'){
      requests.push(u.searchParams);
      return Response.json({total:51,next_cursor:u.searchParams.get('cursor')?null:'second',items:[{
        source_id:'bet88',hand_id:'id',table_name:'Reading',started_at_local:'2026-11-25T05:00',player_count:3,
        player:u.searchParams.get('player')??null,player_dealt:true,dealt_player_count:2,game_type:'HU',
        hole_cards:['Qh','9h'],boards:[['7d','Ah','3c','2h','As'],['Jh','7h','Td','5h','4s']],
        preflop_spot:'Limped',position:'UNKNOWN',position_evidence:'Incomplete first orbit',
        net_result:'0.18000000',net_result_display:'$0.18',starting_balance_display:'$4.61',posted_sb:'0.02000000',posted_bb:'0.05000000',nominal_bb:'0.05000000',nominal_sb:'0.02000000',
        action_line:[{street:'PF',actions:['R','C'],description:'Raise, Call'}],
      }]});
    }
    throw new Error(String(input));
  }));
  return {requests,user:userEvent.setup()};
}

test('defaults to hero and renders compact cards, two boards, exact money and uncertainty',async()=>{
  const {requests}=setup();render(<HandsPage/>);
  await screen.findByRole('button',{name:/Open Reading hand/});
  expect(requests.at(-1)?.get('player')).toBe('Tassadar');
  expect(screen.getByLabelText('Player')).toHaveValue('Tassadar');
  const grid=screen.getByRole('table',{name:'Hand results'});
  expect(within(grid).getByText('$0.18')).toBeInTheDocument();
  expect(within(grid).getByText('HU · 2')).toBeInTheDocument();
  expect(within(grid).getByTitle('Incomplete first orbit')).toHaveTextContent('Unknown');
  expect(within(grid).getByRole('img',{name:'Jack of hearts'})).toBeInTheDocument();
  expect(within(grid).getByTitle('PF: Raise, Call')).toHaveTextContent('PF RC');
});

test('applies combined player filters and resets pagination after changing selection',async()=>{
  const {requests,user}=setup();render(<HandsPage/>);
  await screen.findByRole('button',{name:/Open Reading hand/});
  await user.click(screen.getByRole('button',{name:'Next hands'}));
  await waitFor(()=>expect(requests.at(-1)?.get('cursor')).toBe('second'));
  await user.clear(screen.getByLabelText('Player'));await user.type(screen.getByLabelText('Player'),'궤꼴');
  await user.click(screen.getByLabelText(/Include listed players/));
  await user.selectOptions(screen.getByLabelText('Game type'),'HU');
  await user.selectOptions(screen.getByLabelText('Result'),'lost');
  await user.selectOptions(screen.getByLabelText('Position'),'BB');
  await user.selectOptions(screen.getByLabelText('Player action'),'CALL');
  await user.click(screen.getByText('More filters'));
  await user.selectOptions(screen.getByLabelText('Street'),'River');
  await user.selectOptions(screen.getByLabelText('Sort'),'net_asc');
  await user.click(screen.getByRole('button',{name:'Apply filters'}));
  await waitFor(()=>expect(requests.at(-1)?.get('player')).toBe('궤꼴'));
  const p=requests.at(-1)!;
  expect(Object.fromEntries(p)).toMatchObject({game_type:'HU',result:'lost',position:'BB',action:'CALL',street:'River',sort:'net_asc',include_not_dealt:'true'});
  expect(p.has('cursor')).toBe(false);
});

test('all-hands mode disables actor controls and invites selecting a player',async()=>{
  setup(null);render(<HandsPage/>);
  await screen.findByRole('button',{name:/Open Reading hand/});
  expect(screen.getByLabelText('Result')).toBeDisabled();
  expect(screen.getByLabelText('Position')).toBeDisabled();
  expect(screen.getByText(/Select a player to see/)).toBeInTheDocument();
  expect(screen.queryByText('$0.18')).not.toBeInTheDocument();
});

test('mixed money contexts require a selection before sorting money',async()=>{
  const {user,requests}=setup('Tassadar',true);render(<HandsPage/>);
  await screen.findByRole('button',{name:/Open Reading hand/});
  await user.click(screen.getByText('More filters'));
  await user.selectOptions(screen.getByLabelText('Sort'),'net_desc');
  await user.click(screen.getByRole('button',{name:'Apply filters'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Select a money unit');
  await user.selectOptions(screen.getByLabelText('Money unit'),'peso');
  await user.click(screen.getByRole('button',{name:'Apply filters'}));
  await waitFor(()=>expect(requests.at(-1)?.get('unit')).toBe('peso'));
});

test('clearing the action also clears its street constraint',async()=>{
  const {requests,user}=setup();render(<HandsPage/>);
  await screen.findByRole('button',{name:/Open Reading hand/});
  await user.selectOptions(screen.getByLabelText('Player action'),'CALL');
  await user.click(screen.getByText('More filters'));
  await user.selectOptions(screen.getByLabelText('Street'),'River');
  await user.selectOptions(screen.getByLabelText('Player action'),'');
  await user.click(screen.getByRole('button',{name:'Apply filters'}));
  await waitFor(()=>expect(requests.at(-1)?.has('street')).toBe(false));
});

test('refreshes new money units after an import without overwriting filter drafts',async()=>{
  let added=false;
  vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
    const u=new URL(String(input),'http://localhost');
    if(u.pathname==='/api/settings')return Response.json({hero_name:'Tassadar'});
    if(u.pathname==='/api/imports')return Response.json({items:added?[{job_id:'new',status:'completed',counts:{new:1}}]:[],total:0,next_cursor:null});
    if(u.pathname==='/api/hand-options')return Response.json({players:['Tassadar'],units:[{value:'dollars',label:'Displayed $ (currency unset)'},...(added?[{value:'peso',label:'PHP (₱)'}]:[])],stakes:[]});
    if(u.pathname==='/api/hands')return Response.json({items:[],total:0,next_cursor:null});
    throw new Error(String(input));
  }));
  const user=userEvent.setup();render(<HandsPage/>);
  await screen.findByText('No hands found');
  await user.type(screen.getByLabelText('Table name'),'Draft table');
  added=true;
  await waitFor(()=>expect(within(screen.getByLabelText('Money unit')).getByText('PHP (₱)')).toBeInTheDocument(),{timeout:2500});
  expect(screen.getByLabelText('Table name')).toHaveValue('Draft table');
});
