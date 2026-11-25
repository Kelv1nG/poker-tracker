const { test } = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../extension/lib/controller.js');
const config = { from: '2026-11-25T04:00', to: '2026-11-25T05:00', folder: 'PokerTracker' };
const hand = { id: 'prepared-hand', started_at: '2026-11-25T04:30', table_name: 'Palmdale', players: [], phases: [] };
const rootFrame = { frameId: 0, parentFrameId: -1, children: [{ frameId: 2, visible: true }, { frameId: 3, visible: true }] };
const pokerFrame = { frameId: 2, parentFrameId: 0, children: [], hand };
const command = (type, extra = {}) => ({ pokerTracker: true, type, ...extra });

function environment({ frames = [rootFrame, pokerFrame], closedAfterClick = false, url = 'https://bet88.ph/en/poker/play' } = {}) {
  const values = {};
  const files = [];
  let clicks = 0;
  const api = {
    storage: { local: {
      async get(keys = null) { return Object.fromEntries((keys === null ? Object.keys(values) : keys).filter(key => key in values).map(key => [key, structuredClone(values[key])])); },
      async set(updates) { Object.assign(values, structuredClone(updates)); },
      async remove(keys) { for (const key of keys) delete values[key]; }
    } },
    tabs: {
      async query() { return [{ id: 42, url }]; },
      async executeScript(tabId, options) { assert.equal(tabId, 42); return options.file === 'content.js' ? frames : []; },
      async sendMessage(tabId, message, target) {
        assert.equal(tabId, 42);
        assert.equal(target.frameId, 2, 'all reads and clicks must target the discovered poker iframe');
        if (message.type === 'reset') return { ok: true };
        if (message.type === 'read') {
          if (closedAfterClick && clicks) throw new Error('Receiving end does not exist: tab closed');
          return { ok: true, hand };
        }
        if (message.type === 'advance') { clicks += 1; return { ok: true, advanced: closedAfterClick }; }
        throw new Error('Unexpected command');
      }
    }
  };
  assert.equal(typeof lib.createController, 'function');
  const controller = lib.createController(api, { download: async file => { files.push(JSON.parse(file.data)); return { filename: '/Downloads/complete.json' }; } });
  return { controller, files, clicks: () => clicks };
}

async function idle(controller) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await controller.handle(command('getState'));
    if (!result.state.busy) return result.state;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Collection did not finish');
}

test('starts from the prepared tab and exports through its discovered frame', async () => {
  const { controller, files, clicks } = environment();
  const response = await controller.handle(command('start', { config }));
  assert.equal(response.ok, true);
  const state = await idle(controller);
  assert.equal(state.run.status, 'saved');
  assert.equal(state.run.collected, 1);
  assert.equal(clicks(), 1);
  assert.deepEqual(files[0].hands, [hand]);
});

test('tab loss saves the previously collected hands as an explicitly partial export', async () => {
  const { controller, files } = environment({ closedAfterClick: true });
  await controller.handle(command('start', { config }));
  const state = await idle(controller);
  assert.equal(state.run.status, 'saved');
  assert.equal(files[0].partial, true);
  assert.match(files[0].message, /tab closed/);
});

test('missing or ambiguous frames fail without navigating or writing an export', async () => {
  for (const frames of [[], [rootFrame, pokerFrame, { ...pokerFrame, frameId: 3 }]]) {
    const { controller, files, clicks } = environment({ frames });
    const result = await controller.handle(command('start', { config }));
    assert.equal(result.ok, false);
    assert.match(result.error, /history|multiple|more than one/i);
    assert.equal(clicks(), 0);
    assert.equal(files.length, 0);
  }
});

test('ignores hidden iframe candidates using parent-frame visibility reports', async () => {
  const { controller, files } = environment({ frames: [
    { ...rootFrame, children: [{ frameId: 2, visible: true }, { frameId: 3, visible: false }] },
    pokerFrame, { ...pokerFrame, frameId: 3 }
  ] });
  const result = await controller.handle(command('start', { config }));
  assert.equal(result.ok, true);
  assert.equal((await idle(controller)).run.status, 'saved');
  assert.equal(files.length, 1);
});

test('rejects candidate frames whose embedding chain cannot be verified', async () => {
  const { controller, clicks } = environment({ frames: [{ ...pokerFrame, parentFrameId: 77 }] });
  const result = await controller.handle(command('start', { config }));
  assert.equal(result.ok, false);
  assert.match(result.error, /frame|visibility/i);
  assert.equal(clicks(), 0);
});

test('rejects non-Bet88 tabs and invalid folders before injecting code', async () => {
  const { controller } = environment({ url: 'https://example.com/' });
  const result = await controller.handle(command('start', { config }));
  assert.equal(result.ok, false);
  assert.match(result.error, /Bet88/i);
  const invalid = await controller.handle(command('start', { config: { ...config, folder: '/tmp' } }));
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /folder|path/i);
});
