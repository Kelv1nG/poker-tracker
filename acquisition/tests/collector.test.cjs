const { test } = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../extension/lib/collector.js');
const range = { from: '2026-11-25T04:00', to: '2026-11-25T05:00', folder: 'PokerTracker' };
const hand = (id, time) => ({ id, started_at: `2026-11-25T${time}`, table_name: 'Palmdale', players: [], phases: [] });

async function run(sequence, options = {}) {
  const saved = [];
  const operations = [];
  let cursor = 0;
  const result = await lib.collectHands({
    config: range,
    read: async () => { operations.push(`read:${cursor}`); return sequence[cursor]; },
    advance: async () => { operations.push(`advance:${cursor}`); return ++cursor < sequence.length; },
    save: async value => { operations.push(`save:${value.id}`); saved.push(value.id); },
    progress: async () => {},
    shouldStop: () => false,
    ...options
  });
  return { result, saved, operations };
}

test('skips newer hands, includes both boundaries, and stops before saving an older hand', async () => {
  assert.equal(typeof lib.collectHands, 'function');
  const { result, saved, operations } = await run([hand('newer', '05:01'), hand('upper', '05:00'), hand('middle', '04:30'), hand('lower', '04:00'), hand('older', '03:59'), hand('unread', '03:58')]);
  assert.deepEqual(saved, ['upper', 'middle', 'lower']);
  assert.equal(result.reason, 'cutoff');
  assert.equal(result.partial, false);
  assert.equal(result.inspected, 5);
  assert.ok(operations.indexOf('save:upper') < operations.indexOf('advance:1'), 'capture must persist before the next click');
  assert.ok(!operations.includes('read:5'));
});

test('handles exhausted history independently of the requested lower boundary', async () => {
  const { result, saved } = await run([hand('only', '04:30')]);
  assert.deepEqual(saved, ['only']);
  assert.equal(result.reason, 'end_of_history');
  assert.equal(result.partial, false);
});

test('stops on a duplicate ID instead of repeatedly exporting it', async () => {
  const { result, saved } = await run([hand('same', '04:30'), hand('same', '04:29')]);
  assert.deepEqual(saved, ['same']);
  assert.equal(result.partial, true);
  assert.match(result.message, /repeat|duplicate/i);
});

test('rejects history that starts moving forward in time', async () => {
  const { result, saved } = await run([hand('one', '04:30'), hand('two', '04:31')]);
  assert.deepEqual(saved, ['one']);
  assert.equal(result.reason, 'error');
  assert.match(result.message, /order|newer|forward/i);
});

test('manual stop finishes the current capture and performs no subsequent click', async () => {
  let stopping = false;
  const saved = [];
  const { result, operations } = await run([hand('one', '04:30'), hand('two', '04:29')], {
    read: async () => { stopping = true; return hand('one', '04:30'); },
    save: async value => saved.push(value.id),
    shouldStop: () => stopping
  });
  assert.deepEqual(saved, ['one']);
  assert.equal(result.reason, 'stopped');
  assert.equal(result.partial, true);
  assert.ok(!operations.some(value => value.startsWith('advance')));
});

test('storage failure stops navigation and leaves prior durable captures available', async () => {
  const saved = [];
  const { result, operations } = await run([hand('one', '04:30'), hand('two', '04:29'), hand('three', '04:28')], {
    save: async value => { if (saved.length) throw new Error('Storage is full'); saved.push(value.id); }
  });
  assert.deepEqual(saved, ['one']);
  assert.equal(result.reason, 'error');
  assert.match(result.message, /Storage is full/);
  assert.ok(!operations.includes('advance:1'));
});

test('invalid configuration never reads or navigates the page', async () => {
  let touched = false;
  await assert.rejects(() => run([], { config: { ...range, folder: '/tmp/export' }, read: async () => { touched = true; } }), /folder|path/i);
  assert.equal(touched, false);
});
