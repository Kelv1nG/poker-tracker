const { test } = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../extension/lib/exporter.js');
const config = { from: '2026-11-25T04:00', to: '2026-11-25T05:00', folder: 'PokerTracker/Bet88' };
const firstStructured = {
  id: 'first-hand', started_at: '2026-11-25T05:00',
  players: [{ name: 'Due Date', net_result: '$1.13', final_hand: ['Js', 'Jd', '6d', '6h', 'Ah'] }],
  phases: [{ name: 'Preflop', board: [], new_cards: [], events: [{ type: 'action', player: 'Due Date', action: 'Was dealt', action_code: null, amount: null, cards: [null, null] }] }]
};
const secondStructured = { ...firstStructured, id: 'second-hand', started_at: '2026-11-25T04:30' };
const first = { ...firstStructured, raw_html: '<div>hand one</div>' };
const second = { ...secondStructured, raw_html: '<div>hand two</div>' };

function memoryStorage() {
  const values = {};
  return {
    values,
    async get(keys = null) {
      const selected = keys === null ? Object.keys(values) : typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(selected.filter(key => key in values).map(key => [key, structuredClone(values[key])]));
    },
    async set(updates) { Object.assign(values, structuredClone(updates)); },
    async remove(keys) { for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key]; }
  };
}

async function setup({ storage = memoryStorage(), download } = {}) {
  const files = [];
  assert.equal(typeof lib.createExporter, 'function');
  const exporter = lib.createExporter({
    storage, now: () => new Date('2026-11-25T06:00:00.000Z'),
    download: download || (async file => { files.push({ filename: file.filename, document: JSON.parse(file.data) }); return { filename: `/Downloads/${file.filename}` }; })
  });
  await exporter.initialize();
  return { exporter, storage, files };
}

test('automatically exports complete records, range metadata, and the remembered subfolder', async () => {
  const { exporter, files, storage } = await setup();
  await exporter.begin(config);
  await exporter.capture(first);
  await exporter.capture(second);
  await exporter.finish({ reason: 'cutoff', partial: false, inspected: 3, current: '2026-11-25T03:59' });
  assert.equal(exporter.getState().run.status, 'saved');
  assert.equal(files.length, 1);
  assert.match(files[0].filename, /^PokerTracker\/Bet88\/hands_2026-11-25T04-00_to_2026-11-25T05-00_/);
  assert.deepEqual(files[0].document.hands, [firstStructured, secondStructured]);
  assert.deepEqual(files[0].document.requested_range, { from: config.from, to: config.to, timezone: 'as displayed on the history page' });
  assert.equal(files[0].document.partial, false);
  const reopened = (await setup({ storage })).exporter;
  assert.deepEqual(reopened.getState().config, config);
  assert.equal(reopened.getState().run.status, 'saved');
});

test('failure preserves records for Retry save and blocks a replacement scrape', async () => {
  let fail = true;
  const files = [];
  const { exporter } = await setup({ download: async file => { if (fail) throw new Error('Disk full'); files.push(JSON.parse(file.data)); return { filename: '/Downloads/retried.json' }; } });
  await exporter.begin(config);
  await exporter.capture(first);
  await exporter.finish({ reason: 'error', partial: true, message: 'The tab closed.' });
  assert.equal(exporter.getState().run.status, 'save_failed');
  await assert.rejects(() => exporter.begin(config), /unsaved|retry/i);
  fail = false;
  await exporter.retry();
  assert.equal(exporter.getState().run.status, 'saved');
  assert.equal(files[0].partial, true);
  assert.equal(files[0].finish_reason, 'error');
  assert.deepEqual(files[0].hands, [firstStructured]);
});

test('captures are durable even when the tab vanishes before finishing the run', async () => {
  const { exporter, storage } = await setup();
  await exporter.begin(config, { tabId: 10, frameId: 2 });
  await exporter.capture(first);
  // An older extension version could have retained HTML in its stored captures.
  Object.values(storage.values).find(value => value.hand?.id === first.id).hand.raw_html = '<div>legacy stored panel</div>';
  const recovered = await setup({ storage });
  assert.equal(recovered.exporter.getState().run.status, 'save_failed');
  assert.equal(recovered.exporter.getState().run.collected, 1);
  await recovered.exporter.retry();
  assert.deepEqual(recovered.files[0].document.hands, [firstStructured]);
  assert.equal(recovered.files[0].document.partial, true);
});

test('does not claim a file is saved until the download confirms completion', async () => {
  let confirm;
  const { exporter } = await setup({ download: () => new Promise(resolve => { confirm = resolve; }) });
  await exporter.begin(config);
  await exporter.capture(first);
  const finishing = exporter.finish({ reason: 'stopped', partial: true });
  while (!confirm) await new Promise(resolve => setImmediate(resolve));
  assert.equal(exporter.getState().run.status, 'saving');
  confirm({ filename: '/Downloads/finished.json' });
  await finishing;
  assert.equal(exporter.getState().run.status, 'saved');
});

test('deduplicates captures and shows no matches without creating an empty file', async () => {
  const { exporter, files } = await setup();
  await exporter.begin(config);
  await exporter.finish({ reason: 'end_of_history', partial: false, inspected: 1 });
  assert.equal(exporter.getState().run.status, 'empty');
  assert.equal(files.length, 0);
  await exporter.begin(config);
  await exporter.capture(first);
  await exporter.capture(first);
  await exporter.finish({ reason: 'end_of_history', partial: false });
  assert.equal(files[0].document.hands.length, 1);
});

test('prevents a second run from replacing an active run', async () => {
  const { exporter } = await setup();
  await exporter.begin(config);
  await assert.rejects(() => exporter.begin(config), /running|active|progress/i);
});

test('failure to clean up already-exported records does not orphan the next run', async () => {
  const { exporter, storage, files } = await setup();
  await exporter.begin(config);
  await exporter.capture(first);
  await exporter.finish({ reason: 'end_of_history', partial: false });
  storage.remove = async () => { throw new Error('Cleanup unavailable'); };
  await exporter.begin(config);
  await exporter.capture(second);
  await exporter.finish({ reason: 'end_of_history', partial: false });
  assert.equal(exporter.getState().run.status, 'saved');
  assert.deepEqual(files[1].document.hands, [secondStructured]);
});

test('Retry save uses a corrected folder while preserving the original range and hands', async () => {
  const files = [];
  const { exporter } = await setup({ download: async file => {
    if (file.filename.startsWith('PokerTracker/Bet88/')) throw new Error('ENOTDIR: destination is a file');
    files.push({ filename: file.filename, document: JSON.parse(file.data) });
    return { filename: file.filename };
  } });
  await exporter.begin(config);
  await exporter.capture(first);
  await exporter.finish({ reason: 'end_of_history', partial: false });
  await exporter.saveConfig({ ...config, from: '2026-11-24T00:00', folder: 'PokerTracker/Corrected' });
  await exporter.retry();
  assert.equal(exporter.getState().run.status, 'saved');
  assert.match(files[0].filename, /^PokerTracker\/Corrected\//);
  assert.equal(files[0].document.requested_range.from, '2026-11-25T04:00');
  assert.deepEqual(files[0].document.hands, [firstStructured]);
});

test('new captures omit raw HTML from durable storage without losing cards or events', async () => {
  const { exporter, storage } = await setup();
  await exporter.begin(config);
  await exporter.capture(first);
  const stored = Object.values(storage.values).find(value => value.hand?.id === first.id);
  assert.deepEqual(stored.hand, firstStructured);
  assert.equal(first.raw_html, '<div>hand one</div>', 'capture must not mutate its caller');
});
