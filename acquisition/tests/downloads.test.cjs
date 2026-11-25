const { test } = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../extension/lib/downloads.js');

function downloadBrowser({ earlyEvent = false, completed = true, interrupted = false } = {}) {
  const listeners = new Set();
  const calls = [];
  const api = { downloads: {
    onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) },
    async download(options) {
      calls.push(options);
      if (earlyEvent) for (const listener of listeners) listener({ id: 7, state: { current: 'complete' } });
      return 7;
    },
    async search() { return [{ id: 7, state: interrupted ? 'interrupted' : completed ? 'complete' : 'in_progress', error: interrupted ? 'USER_CANCELED' : undefined, filename: '/Downloads/PokerTracker/export.json' }]; }
  } };
  return { api, listeners, calls };
}

test('detects a download already completed before its ID was returned', async () => {
  assert.equal(typeof lib.createDownloader, 'function');
  const { api, listeners, calls } = downloadBrowser();
  const revoked = [];
  const download = lib.createDownloader(api, { makeUrl: () => 'blob:test', revokeUrl: url => revoked.push(url) });
  const result = await download({ data: '{"hands":[]}', filename: 'PokerTracker/export.json' });
  assert.equal(result.filename, '/Downloads/PokerTracker/export.json');
  assert.equal(calls[0].saveAs, false);
  assert.equal(calls[0].conflictAction, 'uniquify');
  assert.equal(listeners.size, 0);
  assert.deepEqual(revoked, ['blob:test']);
});

test('does not miss completion emitted during download creation', async () => {
  const { api } = downloadBrowser({ earlyEvent: true, completed: false });
  const download = lib.createDownloader(api, { makeUrl: () => 'blob:test', revokeUrl: () => {} });
  const result = await download({ data: '{}', filename: 'PokerTracker/export.json' });
  assert.equal(result.id, 7);
});

test('reports user cancellation and releases download resources', async () => {
  const { api, listeners } = downloadBrowser({ completed: false, interrupted: true });
  const revoked = [];
  const download = lib.createDownloader(api, { makeUrl: () => 'blob:test', revokeUrl: value => revoked.push(value) });
  await assert.rejects(() => download({ data: '{}', filename: 'PokerTracker/export.json' }), /USER_CANCELED|cancel/i);
  assert.equal(listeners.size, 0);
  assert.deepEqual(revoked, ['blob:test']);
});
