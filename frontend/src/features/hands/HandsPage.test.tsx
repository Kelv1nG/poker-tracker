import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import twice from '../../../../backend/tests/fixtures/bet88/run-it-twice.json';
import preflop from '../../../../backend/tests/fixtures/bet88/preflop.json';
import App from '../../App';

function server(payload=twice,{empty=false,fail=false}={}) {
  let failing=fail;
  vi.stubGlobal('fetch',vi.fn(async(input:string)=>{
    const path=String(input).split('?')[0];
    if(path==='/api/imports')return Response.json({items:[],total:0,next_cursor:null});
    if(path==='/api/hands') {
      if(failing){failing=false;return Response.json({detail:'Library unavailable'},{status:503});}
      return Response.json({items:empty?[]:[{source_id:'bet88',hand_id:payload.id,table_name:payload.table_name,started_at_local:payload.started_at,player_count:payload.players.length}],total:empty?0:1,next_cursor:null});
    }
    if(path.startsWith('/api/hands/'))return Response.json({source_id:'bet88',hand_id:payload.id,table_name:payload.table_name,started_at_local:payload.started_at,payload,quality_flags:['source_timezone_unset','currency_unset'],source_timezone:null,started_at_utc:null,currency_code:null,provenance:[{source_hash:'hash',source_index:0,payload_hash:'payload',is_conflict:false,filenames:['hands.json'],submissions:[]}]});
    if(path==='/api/overview')return Response.json({hand_count:2,source_file_count:1,import_count:3,failed_import_count:1,rejected_count:1,conflict_count:1,partial_import_count:0,first_observed:'2026-11-25T03:10',last_observed:'2026-11-25T05:00'});
    throw new Error(`Unexpected request ${input}`);
  }));
}

test('selects a hand and renders both complete runouts, system event and all showdowns',async()=>{
  server();window.location.hash='hands';const user=userEvent.setup();render(<App />);
  await user.click(await screen.findByRole('button',{name:/Open Apple Valley hand/}));
  const river=await screen.findByRole('region',{name:'River 4'});
  for(const card of ['5 of diamonds','King of hearts','2 of diamonds','10 of clubs','8 of spades'])expect(within(river).getAllByRole('img',{name:card}).length).toBeGreaterThan(0);
  const second=screen.getByRole('region',{name:'Table Cards Dealt 7'});
  for(const card of ['Jack of hearts','7 of hearts','10 of diamonds','5 of hearts','4 of spades'])expect(within(second).getAllByRole('img',{name:card}).length).toBeGreaterThan(0);
  expect(screen.getByText('Running it Twice')).toBeInTheDocument();
  expect(screen.getAllByText('Run it twice')).toHaveLength(2);
  expect(screen.getAllByText('Has Pair')).toHaveLength(3);
  expect(screen.getByText('Has High card')).toBeInTheDocument();
  expect(screen.getAllByRole('img',{name:'Unknown card'}).length).toBeGreaterThan(0);
  expect(screen.getAllByText('궤꼴').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/2026-11-25 03:10/).length).toBeGreaterThan(0);
});

test('renders early-ending hands and original money strings without later streets',async()=>{
  server(preflop);window.location.hash='hands';const user=userEvent.setup();render(<App />);
  await user.click(await screen.findByRole('button',{name:/Open Palmdale hand/}));
  await screen.findByRole('region',{name:'Preflop 1'});
  expect(screen.getByText('-$0.05')).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'River'})).not.toBeInTheDocument();
});

test('shows empty results and recovers from a library request failure',async()=>{
  server(twice,{empty:true,fail:true});window.location.hash='hands';const user=userEvent.setup();render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Library unavailable');
  await user.click(screen.getByRole('button',{name:'Try again'}));
  expect(await screen.findByText('No hands found')).toBeInTheDocument();
});

test('overview shows committed counts and observed source times without money totals',async()=>{
  server();window.location.hash='overview';render(<App />);
  const hands=await screen.findByRole('group',{name:'Hands'});
  expect(within(hands).getByText('2')).toBeInTheDocument();
  expect(screen.getByText('2026-11-25 03:10')).toBeInTheDocument();
  expect(screen.getByText('2026-11-25 05:00')).toBeInTheDocument();
  expect(screen.getByText(/Conflicts are included in rejected/)).toBeInTheDocument();
  expect(screen.queryByText(/profit|VPIP|PFR/i)).not.toBeInTheDocument();
});
