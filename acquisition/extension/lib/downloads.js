(() => {
  'use strict';
  function createDownloader(api, {
    makeUrl = data => URL.createObjectURL(new Blob([data], { type: 'application/json' })),
    revokeUrl = url => URL.revokeObjectURL(url), timeoutMs = 120000
  } = {}) {
    return ({ data, filename }) => new Promise((resolve, reject) => {
      const url = makeUrl(data);
      let id = null;
      let settled = false;
      const early = new Map();
      const cleanup = () => {
        clearTimeout(timer);
        api.downloads.onChanged.removeListener(changed);
        revokeUrl(url);
      };
      const fail = error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      async function completed() {
        if (settled) return;
        settled = true;
        cleanup();
        const items = await api.downloads.search({ id }).catch(() => []);
        resolve({ id, filename: items[0]?.filename || filename });
      }
      function consume(state, error) {
        if (state === 'complete') void completed();
        else if (state === 'interrupted') fail(new Error(`Download interrupted: ${error || 'unknown reason'}`));
      }
      function changed(delta) {
        if (id === null) { early.set(delta.id, delta); return; }
        if (delta.id === id) consume(delta.state?.current, delta.error?.current);
      }
      const timer = setTimeout(() => fail(new Error('The local download did not finish within two minutes.')), timeoutMs);
      // Listen before creation: small Blob downloads can finish before download() resolves.
      api.downloads.onChanged.addListener(changed);
      Promise.resolve().then(() => api.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' }))
        .then(async assigned => {
          id = assigned;
          const delta = early.get(id);
          if (delta) consume(delta.state?.current, delta.error?.current);
          if (!settled) {
            const items = await api.downloads.search({ id });
            const item = items[0];
            if (item) consume(item.state, item.error);
          }
        }).catch(fail);
    });
  }
  const exports = { createDownloader };
  if (typeof module === 'object' && module.exports) module.exports = exports;
  else Object.assign(globalThis.PokerTracker, exports);
})();
