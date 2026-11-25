/* Shared validation. Dates intentionally describe wall time, without a timezone. */
(() => {
  'use strict';
  const normalizeText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const pad = value => String(value).padStart(2, '0');

  function parseWallTime(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      throw new Error('Choose a complete date and time, including hours and minutes.');
    }
    const [year, month, day, hour, minute] = value.match(/\d+/g).map(Number);
    const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (year < 1000 || check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month ||
        check.getUTCDate() !== day || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute) {
      throw new Error('The date or time is not a valid calendar value.');
    }
    return value;
  }

  function parsePageHeader(text) {
    const match = normalizeText(text).match(/^Hand Started:\s*([A-Za-z]+) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) (AM|PM)\s*-\s*Hand:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (!match) throw new Error('Cannot read the Hand Started date and hand ID. Open an individual hand history.');
    const [, monthName, day, year, hourText, minute, period, id] = match;
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const month = months.indexOf(monthName.toLowerCase()) + 1;
    const hour = Number(hourText);
    if (!month || hour < 1 || hour > 12) throw new Error('Cannot read the displayed hand date or time.');
    const started_at = parseWallTime(`${year}-${pad(month)}-${pad(day)}T${pad(hour % 12 + (period.toUpperCase() === 'PM' ? 12 : 0))}:${minute}`);
    const started_at_display = `${monthName} ${day}, ${year} ${hourText}:${minute} ${period}`;
    return { id: id.toLowerCase(), started_at, started_at_display };
  }

  function validateFolder(value) {
    if (typeof value !== 'string') throw new Error('Enter an export folder below Downloads.');
    const folder = value.trim();
    const parts = folder.split('/');
    if (!folder || folder.length > 200 || /[<>:"\\|?*\x00-\x1f\x7f]/.test(folder) ||
        parts.some(part => !part || part.startsWith('.') || part.endsWith('.') || part !== part.trim())) {
      throw new Error('Use a relative folder such as PokerTracker/Bet88, without absolute paths, dots at the ends, or parent-directory references.');
    }
    return folder;
  }

  function validateConfig(input) {
    const from = parseWallTime(input?.from);
    const to = parseWallTime(input?.to);
    if (from > to) throw new Error('From must be earlier than or equal to To.');
    return { from, to, folder: validateFolder(input?.folder) };
  }

  function defaultConfig(date = new Date()) {
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return { from: `${day}T00:00`, to: `${day}T23:59`, folder: 'PokerTracker' };
  }

  function buildFilename(config, exportedAt) {
    const stamp = value => value.replaceAll(':', '-');
    return `${validateFolder(config.folder)}/hands_${stamp(config.from)}_to_${stamp(config.to)}_${stamp(exportedAt).replace(/[^\dTZ.\-]/g, '_')}.json`;
  }

  const api = { normalizeText, parseWallTime, parsePageHeader, validateFolder, validateConfig, defaultConfig, buildFilename };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(globalThis.PokerTracker ||= {}, api);
})();
