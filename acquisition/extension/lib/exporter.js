/* Durable captures live in extension storage, independently of the source tab and popup. */
(() => {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./core.js') : globalThis.PokerTracker;
  const RUN_KEY = 'pokerTracker.run';
  const CONFIG_KEY = 'pokerTracker.config';
  const active = status => ['running', 'stopping', 'saving'].includes(status);

  function structuredHand(hand) {
    const record = { ...hand };
    delete record.raw_html;
    return record;
  }

  function createExporter({ storage, download, now = () => new Date(), onStatus = () => {} }) {
    let run = null;
    let config = core.defaultConfig(now());
    let ids = new Set();
    let writeQueue = Promise.resolve();
    const prefix = () => `pokerTracker.hand.${run.id}.`;
    const getState = () => structuredClone({ config, run: run || { status: 'idle', inspected: 0, collected: 0 } });
    const announce = () => onStatus(getState());
    function persist() {
      const value = structuredClone(run);
      writeQueue = writeQueue.catch(() => {}).then(() => storage.set({ [RUN_KEY]: value }));
      announce();
      return writeQueue;
    }
    async function records() {
      const all = await storage.get(null);
      return Object.entries(all).filter(([key]) => key.startsWith(prefix())).map(([, value]) => value).sort((a, b) => a.order - b.order);
    }

    async function initialize() {
      const saved = await storage.get([RUN_KEY, CONFIG_KEY]);
      if (saved[CONFIG_KEY]) {
        try { config = core.validateConfig(saved[CONFIG_KEY]); } catch { /* A stale setting cannot start a run. */ }
      }
      run = saved[RUN_KEY] || null;
      if (run) {
        ids = new Set((await records()).map(record => record.hand.id));
        run.collected = ids.size;
        if (active(run.status)) {
          run.status = ids.size ? 'save_failed' : 'empty';
          run.partial = true;
          run.reason = 'interrupted';
          run.message = 'The previous run was interrupted. Retry save to export its stored hands.';
          run.error = run.message;
          run.finished_at = now().toISOString();
          await persist();
        }
      }
      return getState();
    }

    async function saveConfig(input) {
      const validated = core.validateConfig(input);
      await storage.set({ [CONFIG_KEY]: validated });
      config = validated;
      announce();
      return getState();
    }

    async function begin(input, context = {}) {
      const validated = core.validateConfig(input);
      if (run && active(run.status)) throw new Error('An export is already running. Stop it before starting another.');
      if (run?.collected && run.status !== 'saved') throw new Error('There are unsaved hands. Use Retry save before starting another run.');
      const previousRun = run;
      run = {
        id: crypto.randomUUID(), status: 'running', config: validated,
        started_at: now().toISOString(), inspected: 0, collected: 0, current: null,
        starting_hand: null, observed_range: null, partial: false, message: '', error: null,
        tabId: context.tabId ?? null, frameId: context.frameId ?? null
      };
      try {
        await storage.set({ [RUN_KEY]: run, [CONFIG_KEY]: validated });
      } catch (error) {
        run = previousRun;
        throw error;
      }
      config = validated;
      ids = new Set();
      // Remove only successfully exported older captures, after the new run is durable.
      if (previousRun?.status === 'saved') {
        try {
          const oldPrefix = `pokerTracker.hand.${previousRun.id}.`;
          const all = await storage.get(null);
          const oldKeys = Object.keys(all).filter(key => key.startsWith(oldPrefix));
          if (oldKeys.length) await storage.remove(oldKeys);
        } catch {
          // These records are already exported and isolated by run ID. Cleanup
          // must never leave the new, durable run orphaned before collection starts.
        }
      }
      announce();
      return getState();
    }

    async function capture(hand) {
      if (!run || !['running', 'stopping'].includes(run.status)) throw new Error('No hand collection is active.');
      if (ids.has(hand.id)) return;
      await storage.set({ [prefix() + hand.id]: { order: ids.size, hand: structuredHand(hand) } });
      ids.add(hand.id);
      run.collected = ids.size;
      await persist();
    }

    async function progress(stats) {
      Object.assign(run, stats, { collected: ids.size });
      await persist();
    }

    async function markStopping() {
      if (run?.status === 'running') {
        run.status = 'stopping';
        await persist();
      }
      return getState();
    }

    async function exportCurrent() {
      try {
        // Older stored captures can still contain markup from earlier versions.
        const hands = (await records()).map(record => structuredHand(record.hand));
        run.collected = hands.length;
        if (!hands.length) {
          run.status = 'empty';
          await persist();
          return getState();
        }
        run.status = 'saving';
        run.error = null;
        const exported_at = now().toISOString();
        run.filename = core.buildFilename(run.config, exported_at);
        await persist();
        const document = {
          schema_version: 1,
          source: 'Bet88 hand history',
          requested_range: { from: run.config.from, to: run.config.to, timezone: 'as displayed on the history page' },
          time_resolution: 'minute',
          started_from: run.starting_hand,
          observed_range: run.observed_range,
          exported_range: { newest: hands[0].started_at, oldest: hands[hands.length - 1].started_at },
          exported_at, finish_reason: run.reason, partial: Boolean(run.partial),
          message: run.message, hand_count: hands.length, hands
        };
        const saved = await download({ data: JSON.stringify(document, null, 2), filename: run.filename });
        run.status = 'saved';
        run.saved_path = saved?.filename || run.filename;
        run.error = null;
        await persist();
      } catch (error) {
        run.status = 'save_failed';
        run.error = `Could not save the export: ${error.message || String(error)}. Collected hands are kept; use Retry save.`;
        await persist().catch(() => {});
      }
      announce();
      return getState();
    }

    async function finish(result) {
      Object.assign(run, result, { collected: ids.size, finished_at: now().toISOString() });
      await persist().catch(error => {
        run.partial = true;
        run.message = `${run.message || ''} Could not persist the final status: ${error.message}`.trim();
      });
      return exportCurrent();
    }

    async function retry(folder = config.folder) {
      if (!run || active(run.status) || !run.collected) throw new Error('There is no failed export to retry.');
      const destination = core.validateFolder(folder);
      run.config = { ...run.config, folder: destination };
      config = { ...config, folder: destination };
      await storage.set({ [CONFIG_KEY]: config });
      return exportCurrent();
    }

    return { initialize, saveConfig, begin, capture, progress, markStopping, finish, retry, getState };
  }

  const api = { createExporter };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(globalThis.PokerTracker, api);
})();
