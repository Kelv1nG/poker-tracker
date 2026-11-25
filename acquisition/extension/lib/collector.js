(() => {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./core.js') : globalThis.PokerTracker;

  async function collectHands({ config: input, read, advance, save, progress = async () => {}, shouldStop = () => false }) {
    const config = core.validateConfig(input);
    const seen = new Set();
    const stats = { inspected: 0, collected: 0, current: null, starting_hand: null, observed_range: null };
    const finish = (reason, message) => ({ ...stats, reason, message, partial: reason === 'stopped' || reason === 'error' });
    let previousTime = null;
    try {
      while (true) {
        if (shouldStop()) return finish('stopped', 'Stopped by you. Collected hands have been kept.');
        const hand = await read();
        if (!hand?.id) throw new Error('The page returned a hand without an ID.');
        core.parseWallTime(hand.started_at);
        if (seen.has(hand.id)) throw new Error('A hand ID repeated. Stopping to avoid duplicate or stale data.');
        if (previousTime && hand.started_at > previousTime) throw new Error('Previous Hand moved forward to a newer date. The history is not in backward chronological order.');
        seen.add(hand.id);
        previousTime = hand.started_at;
        stats.inspected += 1;
        stats.current = hand.started_at;
        stats.starting_hand ||= { id: hand.id, started_at: hand.started_at, table_name: hand.table_name };
        stats.observed_range = { newest: stats.starting_hand.started_at, oldest: hand.started_at };
        if (hand.started_at >= config.from && hand.started_at <= config.to) {
          await save(hand);
          stats.collected += 1;
        }
        await progress({ ...stats });
        if (hand.started_at < config.from) return finish('cutoff', 'Reached a hand earlier than From.');
        if (shouldStop()) return finish('stopped', 'Stopped by you. Collected hands have been kept.');
        if (!await advance()) return finish('end_of_history', 'Reached the oldest available hand.');
      }
    } catch (error) {
      return finish('error', error.message || String(error));
    }
  }

  const api = { collectHands };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(globalThis.PokerTracker, api);
})();
