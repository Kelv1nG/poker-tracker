const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/lib/core.js');

test('parses the displayed hand time without applying the machine timezone', () => {
  assert.equal(typeof core.parsePageHeader, 'function');
  assert.deepEqual(core.parsePageHeader('Hand Started: November 25, 2026 5:00 AM - Hand: b4f44e71-cd65-47d6-9e34-1215fa2b3308'), {
    id: 'b4f44e71-cd65-47d6-9e34-1215fa2b3308',
    started_at: '2026-11-25T05:00',
    started_at_display: 'November 25, 2026 5:00 AM'
  });
  assert.equal(core.parsePageHeader('Hand Started: January 1, 2027 12:00 AM - Hand: b4f44e71-cd65-47d6-9e34-1215fa2b3308').started_at, '2027-01-01T00:00');
  assert.equal(core.parsePageHeader('Hand Started: January 1, 2027 12:00 PM - Hand: b4f44e71-cd65-47d6-9e34-1215fa2b3308').started_at, '2027-01-01T12:00');
});

test('rejects impossible calendar dates, omitted times, and ambiguous timestamps', () => {
  assert.equal(typeof core.parseWallTime, 'function');
  for (const value of ['2026-02-29T05:00', '2026-11-31T05:00', '2026-11-25T24:00', '2026-11-25', '11/25/2026 5:00', '2026-11-25T05:00Z']) {
    assert.throws(() => core.parseWallTime(value), /date|time/i, value);
  }
  assert.equal(core.parseWallTime('2028-02-29T23:59'), '2028-02-29T23:59');
});

test('validates an inclusive single-minute range and normalizes its remembered folder', () => {
  assert.equal(typeof core.validateConfig, 'function');
  assert.deepEqual(core.validateConfig({ from: '2026-11-25T05:00', to: '2026-11-25T05:00', folder: ' PokerTracker/Bet88 ' }), {
    from: '2026-11-25T05:00', to: '2026-11-25T05:00', folder: 'PokerTracker/Bet88'
  });
  assert.throws(() => core.validateConfig({ from: '2026-11-25T05:01', to: '2026-11-25T05:00', folder: 'PokerTracker' }), /from|range/i);
});

test('rejects folders Firefox cannot safely use below Downloads', () => {
  assert.equal(typeof core.validateFolder, 'function');
  for (const folder of ['', '/home/kelvin/export', '../PokerTracker', 'a/../b', 'a//b', 'a/.hidden', 'a/end.', 'C:\\export', 'a\\b', 'a/ space', 'a/space /b', 'a\nfile', 'a:file']) {
    assert.throws(() => core.validateFolder(folder), /folder|path/i, JSON.stringify(folder));
  }
  assert.equal(core.validateFolder('Poker hands/Bet88'), 'Poker hands/Bet88');
});
