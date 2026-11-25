(() => {
  'use strict';
  const P = typeof module === 'object' && module.exports
    ? Object.assign({}, require('./core.js'), require('./collector.js'), require('./exporter.js'), require('./downloads.js'))
    : globalThis.PokerTracker;

  function createController(api, options = {}) {
    const exporter = P.createExporter({ storage: api.storage.local, download: options.download || P.createDownloader(api), now: options.now });
    const ready = exporter.initialize();
    let busy = false;
    let stopping = false;
    const state = () => ({ ...exporter.getState(), busy });
    const message = (type, extra = {}) => ({ pokerTracker: true, type, ...extra });

    async function discover() {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https:\/\/(?:[a-z0-9-]+\.)*bet88\.ph(?:\/|$)/i.test(tab.url || '')) {
        throw new Error('Select your Bet88 tab and open an individual hand in Hand History.');
      }
      let frames;
      try {
        for (const file of ['lib/core.js', 'lib/dom.js', 'content.js']) {
          frames = await api.tabs.executeScript(tab.id, { file, allFrames: true, runAt: 'document_idle' });
        }
      } catch (error) {
        throw new Error(`Could not inspect the Bet88 history frames. Check the extension's access to Bet88 and keep the history page open. ${error.message}`);
      }
      const byId = new Map((frames || []).filter(Boolean).map(frame => [frame.frameId, frame]));
      function frameVisible(frame, visited = new Set()) {
        if (frame.frameId === 0) return true;
        if (visited.has(frame.frameId)) throw new Error('Cannot verify the history frame visibility: its parent chain is inconsistent.');
        visited.add(frame.frameId);
        const parent = byId.get(frame.parentFrameId);
        const embedding = parent?.children?.find(child => child.frameId === frame.frameId);
        if (!embedding) throw new Error('Cannot verify the history iframe visibility. Allow access to its Bet88 parent frames and reopen the history.');
        return embedding.visible && frameVisible(parent, visited);
      }
      const candidates = (frames || []).filter(frame => frame?.hand || frame?.error).filter(frame => frameVisible(frame));
      const errors = candidates.filter(frame => frame.error);
      if (errors.length) throw new Error(errors[0].error);
      const found = candidates.filter(frame => frame.hand);
      if (found.length > 1) throw new Error('More than one hand history frame is visible. Open just one history view.');
      if (!found.length) throw new Error('No visible hand history was found in the accessible frames. Open an individual Bet88 hand; if it is embedded, allow the extension to access that Bet88 frame.');
      return { tabId: tab.id, frameId: found[0].frameId, hand: found[0].hand };
    }

    async function callFrame(target, type) {
      const response = await api.tabs.sendMessage(target.tabId, message(type), { frameId: target.frameId });
      if (!response?.ok) throw new Error(response?.error || 'The hand history stopped responding. Keep the source tab open.');
      return response;
    }

    async function start(config) {
      const validated = P.validateConfig(config);
      if (busy) throw new Error('An export is already in progress.');
      busy = true;
      stopping = false;
      try {
        const target = await discover();
        await callFrame(target, 'reset');
        await exporter.begin(validated, target);
        // This job belongs to the background page, never to the popup.
        void (async () => {
          try {
            const result = await P.collectHands({
              config: validated,
              read: async () => (await callFrame(target, 'read')).hand,
              advance: async () => (await callFrame(target, 'advance')).advanced,
              save: hand => exporter.capture(hand),
              progress: stats => exporter.progress(stats),
              shouldStop: () => stopping
            });
            await exporter.finish(result);
          } catch (error) {
            await exporter.finish({ reason: 'error', partial: true, message: error.message });
          } finally { busy = false; }
        })().catch(error => console.error('Poker Tracker export could not finish:', error));
      } catch (error) {
        busy = false;
        throw error;
      }
    }

    async function handle(request, sender = {}) {
      if (!request?.pokerTracker) return undefined;
      if (request.type === 'frameInfo') return { ...request.info, frameId: sender.frameId ?? 0 };
      // Content scripts only report their frame. User commands come from extension pages.
      if (sender.tab) return { ok: false, error: 'This command is only available from the extension popup.' };
      try {
        await ready;
        switch (request.type) {
          case 'getState': break;
          case 'preview': {
            const preview = busy ? null : await discover();
            return { ok: true, state: state(), preview };
          }
          case 'saveConfig': await exporter.saveConfig(request.config); break;
          case 'start': await start(request.config); break;
          case 'stop': stopping = true; await exporter.markStopping(); break;
          case 'retry':
            if (busy) throw new Error('Wait for the current export to finish.');
            busy = true;
            try { await exporter.retry(request.folder); } finally { busy = false; }
            break;
          default: throw new Error('Unknown Poker Tracker command.');
        }
        return { ok: true, state: state() };
      } catch (error) {
        return { ok: false, error: error.message || String(error) };
      }
    }
    return { handle };
  }

  const exports = { createController };
  if (typeof module === 'object' && module.exports) module.exports = exports;
  else Object.assign(globalThis.PokerTracker, exports);
})();
