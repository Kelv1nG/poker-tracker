(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const P = PokerTracker;
  let pending = false;
  let initialized = false;
  let lastState = null;
  let refreshing = false;
  const showError = message => { $('error').textContent = message || ''; $('error').hidden = !message; };
  const input = () => ({ from: $('from').value, to: $('to').value, folder: $('folder').value });
  const time = value => value ? value.replace('T', ' ') : '';
  async function send(type, extra = {}) {
    const reply = await browser.runtime.sendMessage({ pokerTracker: true, type, ...extra });
    if (!reply?.ok) throw new Error(reply?.error || 'The extension background is unavailable. Reload the temporary add-on.');
    return reply;
  }

  function render(state) {
    lastState = state;
    const run = state.run;
    const collecting = ['running', 'stopping'].includes(run.status);
    const locked = pending || state.busy || collecting || run.status === 'saving';
    const unsaved = run.status === 'save_failed' && run.collected > 0;
    $('settings').disabled = locked;
    $('start').disabled = locked || unsaved;
    $('start').hidden = unsaved;
    $('start').firstChild.textContent = locked ? 'Working… ' : 'Start export ';
    $('stop').hidden = !collecting;
    $('stop').disabled = run.status === 'stopping' || pending;
    $('stop').textContent = run.status === 'stopping' ? 'Stopping…' : 'Stop';
    $('retry').hidden = !unsaved;
    $('retry').disabled = pending || state.busy;
    $('inspected').textContent = String(run.inspected || 0);
    $('collected').textContent = String(run.collected || 0);
    $('current').textContent = run.current ? `Reached ${time(run.current)}` : 'No hands collected yet.';
    const titles = {
      idle: 'Ready', running: 'Collecting hands', stopping: 'Finishing the current hand',
      saving: 'Saving your file', saved: run.partial ? 'Partial export saved' : 'Export saved',
      empty: run.partial ? 'Stopped without an export' : 'No matching hands', save_failed: 'Export needs saving'
    };
    $('status-title').textContent = titles[run.status] || 'Ready';
    $('badge').textContent = run.partial ? 'PARTIAL' : 'LOCAL JSON';
    $('status-note').textContent = run.error || run.message ||
      (collecting ? 'You can close this popup. Keep the history tab open.' : 'The file saves automatically when collection ends.');
    $('saved-path').hidden = run.status !== 'saved';
    $('saved-path').textContent = run.status === 'saved' ? run.saved_path || run.filename : '';
    if (run.starting_hand && (collecting || run.status === 'saving')) {
      $('source').textContent = `Started at ${run.starting_hand.table_name || 'the displayed hand'} · ${time(run.starting_hand.started_at)}`;
      $('source').title = run.starting_hand.id;
    }
  }

  async function action(body) {
    pending = true;
    showError('');
    if (lastState) render(lastState);
    try {
      const reply = await body();
      if (reply?.state) render(reply.state);
    } catch (error) { showError(error.message); }
    finally {
      pending = false;
      if (lastState) render(lastState);
    }
  }

  $('export-form').addEventListener('submit', event => {
    event.preventDefault();
    void action(() => send('start', { config: P.validateConfig(input()) }));
  });
  $('stop').addEventListener('click', () => { void action(() => send('stop')); });
  $('retry').addEventListener('click', () => { void action(() => send('retry', { folder: P.validateFolder($('folder').value) })); });
  $('settings').addEventListener('change', () => {
    if (!initialized) return;
    void (async () => {
      try {
        const reply = await send('saveConfig', { config: P.validateConfig(input()) });
        showError('');
        render(reply.state);
      } catch (error) { showError(error.message); }
    })();
  });

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const reply = await send('getState');
      render(reply.state);
    } catch (error) { showError(error.message); }
    finally { refreshing = false; }
  }

  void (async () => {
    try {
      const reply = await send('getState');
      const config = reply.state.config;
      for (const key of ['from', 'to', 'folder']) $(key).value = config[key];
      initialized = true;
      render(reply.state);
      if (!reply.state.busy) {
        try {
          const preview = (await send('preview')).preview;
          if (preview?.hand) {
            $('source').textContent = `${preview.hand.table_name} · ${time(preview.hand.started_at)}`;
            $('source').title = preview.hand.id || '';
          }
        } catch (error) { $('source').textContent = error.message; }
      }
    } catch (error) { showError(error.message); }
    setInterval(() => { void refresh(); }, 500);
  })();
})();
