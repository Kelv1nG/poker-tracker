(() => {
  'use strict';
  const P = globalThis.PokerTracker;
  if (!globalThis.PokerTrackerContent) {
    const session = { last: null, previous: null, reading: false };
    globalThis.PokerTrackerContent = session;
    browser.runtime.onMessage.addListener(request => {
      if (!request?.pokerTracker || !['reset', 'read', 'advance'].includes(request.type)) return undefined;
      return (async () => {
        if (request.type === 'reset') {
          if (session.reading) throw new Error('A hand is already being read.');
          session.last = null;
          session.previous = null;
          return { ok: true };
        }
        if (request.type === 'read') {
          if (session.reading) throw new Error('A hand is already being read.');
          session.reading = true;
          try {
            const result = await P.waitForHand(document, { previous: session.previous });
            session.last = result.snapshot;
            session.previous = null;
            return { ok: true, hand: result.hand };
          } finally { session.reading = false; }
        }
        const panel = P.findHandPanel(document);
        if (!panel || !session.last || P.parsePageHeader(panel.querySelector('h5')?.textContent).id !== session.last.id) {
          throw new Error('The displayed hand changed outside this export. Start again from the desired hand.');
        }
        const control = P.previousControl(document, panel);
        if (control.disabled) return { ok: true, advanced: false };
        session.previous = session.last;
        control.element.click();
        return { ok: true, advanced: true };
      })().catch(error => ({ ok: false, error: error.message }));
    });
  }
  let info = { hand: null };
  try {
    Object.assign(info, P.describeFrameVisibility(window, target => browser.runtime.getFrameId(target)));
    const panel = P.findHandPanel(document);
    if (panel) info.hand = { ...P.parsePageHeader(panel.querySelector('h5')?.textContent), table_name: P.normalizeText(panel.querySelector('h3')?.textContent) };
  } catch (error) { info.error = error.message; }
  return browser.runtime.sendMessage({ pokerTracker: true, type: 'frameInfo', info });
})();
