import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';

const settings = { watch_path:'/home/kelvin/Downloads/PokerTracker', watch_enabled:false,
  hero_name:null,source_timezone:null,currency_code:null };
const job = { job_id:'11111111-1111-4111-8111-111111111111',filename:'sample.json',trigger:'upload',
  source_id:'bet88',source_hash:'hash',importer_version:1,status:'completed',
  counts:{new:2,duplicate:0,rejected:0,conflict:0},created_at:'2026-11-26T00:00:00+00:00',
  started_at:null,finished_at:null,error:null,retry_of:null,source_metadata:{partial:false} };

function server(initialJobs: any[] = []) {
  let saved = { ...settings };
  let jobs = [...initialJobs];
  vi.stubGlobal('fetch',vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input).split('?')[0];
    if (path === '/api/settings') {
      if (init?.method === 'PATCH') {
        const patch = JSON.parse(String(init.body));
        if (patch.watch_path === '/forbidden') return Response.json({detail:'Choose a directory outside the source archive'}, {status:422});
        saved = {...saved,...patch};
      }
      return Response.json(saved);
    }
    if (path === '/api/watcher') return Response.json({enabled:saved.watch_enabled,state:saved.watch_enabled?'watching':'paused',watch_path:saved.watch_path,last_scan:null,error:null});
    if (path === '/api/imports' && init?.method === 'POST') {
      const file = (init.body as FormData).get('file') as File;
      jobs = [{...job,filename:file.name},...jobs];
      return Response.json({job_id:job.job_id,status:'queued'}, {status:202});
    }
    if (path === '/api/imports') return Response.json({items:jobs,total:jobs.length,next_cursor:null});
    if (path.endsWith('/retry')) {
      jobs = [{...job,job_id:'22222222-2222-4222-8222-222222222222',filename:'retry.json'},...jobs];
      return Response.json({job_id:jobs[0].job_id,status:'queued'}, {status:202});
    }
    if (path.startsWith('/api/imports/')) return Response.json({...jobs[0],issues:{items:jobs[0]?.counts.rejected ? [
      {source_index:1,hand_id:null,outcome:'rejected',reason:'players.0.net_result: Invalid money'}] : [],total:jobs[0]?.counts.rejected??0,next_cursor:null},submissions:[]});
    throw new Error(`Unexpected request: ${init?.method??'GET'} ${input}`);
  }));
  return () => saved;
}

test('shows an empty library and persisted watch folder without invented counts',async () => {
  server(); render(<App />);
  expect(await screen.findByText('No imports yet')).toBeInTheDocument();
  expect(screen.getByLabelText('Watch folder')).toHaveValue(settings.watch_path);
  expect(screen.getByRole('button',{name:'Start watching'})).toBeEnabled();
  expect(screen.queryByText('1,145')).not.toBeInTheDocument();
});

test('uploads a native JSON file and displays committed response counts',async () => {
  server(); const user=userEvent.setup(); render(<App />);
  await screen.findByText('No imports yet');
  await user.upload(screen.getByLabelText('Import JSON file'),new File(['{}'],'sample.json',{type:'application/json'}));
  const file = await screen.findByRole('button',{name:'sample.json'});
  const row = file.closest('tr')!;
  expect(within(row).getByText('2')).toBeInTheDocument();
  expect(within(row).getByText('Imported')).toBeInTheDocument();
});

test('saves an edited folder while enabling and pausing discovery',async () => {
  const saved=server(); const user=userEvent.setup(); render(<App />);
  const field=await screen.findByLabelText('Watch folder');
  await waitFor(()=>expect(field).toHaveValue(settings.watch_path));
  await user.clear(field); await user.type(field,'/tmp/hands');
  await user.click(screen.getByRole('button',{name:'Start watching'}));
  await screen.findByRole('button',{name:'Pause watching'});
  expect(saved().watch_path).toBe('/tmp/hands');
  expect(saved().watch_enabled).toBe(true);
  await user.click(screen.getByRole('button',{name:'Pause watching'}));
  await screen.findByRole('button',{name:'Start watching'});
  expect(saved().watch_enabled).toBe(false);
});

test('keeps history visible after an invalid watch directory',async () => {
  server([job]); const user=userEvent.setup(); render(<App />);
  await screen.findByRole('button',{name:'sample.json'});
  const field=screen.getByLabelText('Watch folder');
  await user.clear(field); await user.type(field,'/forbidden');
  await user.click(screen.getByRole('button',{name:'Start watching'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('outside the source archive');
  expect(screen.getByRole('button',{name:'sample.json'})).toBeInTheDocument();
});

test('shows partial-source warning and indexed rejection detail and retries the archive',async () => {
  server([{...job,status:'completed_with_errors',counts:{new:1,duplicate:0,rejected:1,conflict:0},source_metadata:{partial:true,message:'Stopped early'}}]);
  const user=userEvent.setup(); render(<App />);
  await user.click(await screen.findByRole('button',{name:'sample.json'}));
  expect(await screen.findByText('Record 2')).toBeInTheDocument();
  expect(screen.getByText(/players.0.net_result/)).toBeInTheDocument();
  expect(screen.getByText(/Stopped early/)).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Retry import'}));
  expect(await screen.findByRole('button',{name:'retry.json'})).toBeInTheDocument();
});

test('saves optional exact hero name and explicit source context',async () => {
  const saved=server(); const user=userEvent.setup(); render(<App />);
  await screen.findByText('No imports yet');
  await user.click(screen.getByText('Source settings'));
  await user.type(screen.getByLabelText('Hero screen name'),'궤꼴');
  await user.type(screen.getByLabelText('Source timezone'),'Asia/Manila');
  await user.type(screen.getByLabelText('Currency code'),'PHP');
  await user.click(screen.getByRole('button',{name:'Save source settings'}));
  await waitFor(()=>expect(saved().hero_name).toBe('궤꼴'));
  expect(saved().source_timezone).toBe('Asia/Manila');
  expect(saved().currency_code).toBe('PHP');
});
