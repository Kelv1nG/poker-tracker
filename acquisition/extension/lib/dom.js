/* Extract only the rendered hand panel; never scrape unrelated account content. */
(() => {
  'use strict';
  const P = globalThis.PokerTracker;
  const text = element => P.normalizeText(element?.textContent);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function elementVisible(element) {
    if (!element || !element.isConnected || !element.getClientRects().length) return false;
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  function visible(element) {
    if (!elementVisible(element)) return false;
    let view = element.ownerDocument.defaultView;
    // A document does not inherit CSS visibility from its embedding iframe.
    // Check accessible ancestors here; cross-origin links are verified by discovery.
    while (view && view.parent !== view) {
      let embedding;
      try { embedding = view.frameElement; } catch { break; }
      if (!embedding) break;
      if (!elementVisible(embedding)) return false;
      view = embedding.ownerDocument.defaultView;
    }
    return true;
  }

  function describeFrameVisibility(view, getFrameId) {
    return {
      parentFrameId: view.parent === view ? -1 : getFrameId(view.parent),
      children: [...view.document.querySelectorAll('iframe, frame, embed, object')]
        .map(element => ({ frameId: getFrameId(element), visible: visible(element) }))
        .filter(child => child.frameId > 0)
    };
  }

  function findHandPanel(doc) {
    const panels = [...doc.querySelectorAll('.full-hand-container')].filter(visible);
    if (panels.length > 1) throw new Error('More than one hand history is visible. Open just one individual hand.');
    return panels[0] || null;
  }

  function cards(element) {
    return [...element.querySelectorAll('.log-card')].map(card => {
      if (card.classList.contains('back')) return null;
      const rank = text(card.querySelector('.card-str')).replace(/^10$/, 'T');
      const suit = ['s', 'h', 'd', 'c'].find(value => card.classList.contains(value) || card.querySelector(`.suit-icon-${value}`));
      if (!/^[2-9TJQKA]$/.test(rank) || !suit) throw new Error('A card is unreadable; wait for the complete hand to load.');
      return rank + suit;
    });
  }

  function extractHand(panel) {
    if (!panel) throw new Error('Open an individual hand history before starting.');
    const header = P.parsePageHeader(text(panel.querySelector('h5')));
    const table_name = text(panel.querySelector('h3'));
    if (!table_name) throw new Error('The table name has not loaded.');
    const players = [...panel.querySelectorAll('.player-results > .player-result')].map(row => {
      const name = text(row.querySelector('.name'));
      const starting_balance = text(row.querySelector('.initial-balance'));
      const net_result = text(row.querySelector('.net-win'));
      if (!name || !starting_balance || !net_result) throw new Error('The player results have not finished loading.');
      return { name, starting_balance, net_result, final_hand: cards(row.querySelector('.final-hand') || row.ownerDocument.createElement('div')) };
    });
    if (players.length < 2) throw new Error('The complete player summary has not loaded.');

    const phases = [...panel.querySelectorAll('.phase-group')].map(group => {
      const name = text(group.querySelector('.phase-title')) || 'Preflop';
      const events = [];
      let board = [];
      let new_cards = [];
      for (const row of group.querySelectorAll('table.selected-hand-table > tbody > tr')) {
        const cells = row.querySelectorAll(':scope > td');
        if (!cells.length) continue;
        if (cells.length !== 3) throw new Error('An event row is incomplete.');
        if (row.querySelector('.phase-title')) {
          board = cards(cells[2]);
          // Read direct new-card nodes without also counting the cumulative board.
          const newContainer = cells[2].cloneNode(true);
          newContainer.querySelectorAll('.previous-cards').forEach(previous => previous.remove());
          new_cards = cards(newContainer);
          const expected = { flop: 3, turn: 4, river: 5 }[name.toLowerCase()];
          if (expected && board.length !== expected) throw new Error(`The ${name} board has not finished loading.`);
          events.push({ type: 'board', board: [...board], new_cards: [...new_cards] });
          continue;
        }
        const player = text(cells[0]);
        const action = text(cells[1]);
        // Run-it-twice begins with a table-wide announcement without an actor.
        // Keep this explicit so missing names on actual player actions still block reads.
        const systemAnnouncement = !player && action.toLowerCase() === 'running it twice';
        if (!action || (!player && !systemAnnouncement)) throw new Error('A player action has not finished loading.');
        const actionNode = cells[1].querySelector('.player-action');
        const action_code = actionNode ? [...actionNode.classList].find(value => value !== 'player-action') || null : null;
        events.push({ type: systemAnnouncement ? 'system' : 'action', player: player || null, action, action_code, amount: cells[2].classList.contains('amount') ? text(cells[2]) || null : null, cards: cards(cells[2]) });
      }
      if (!events.length) throw new Error('The hand events have not finished loading.');
      return { name, board, new_cards, events };
    });
    if (!phases.length || !phases.some(phase => phase.events.some(event => event.type === 'action'))) {
      throw new Error('The hand events have not loaded.');
    }
    return { ...header, table_name, players, phases };
  }

  function previousControl(doc, panel) {
    // Search the nearest container first: navigation sits just outside the hand panel.
    for (let scope = panel.parentElement; scope; scope = scope.parentElement) {
      const matches = [...scope.querySelectorAll('button, a, [role="button"], input[type="button"]')]
        .filter(node => visible(node) && P.normalizeText(node.value || node.textContent).toLowerCase() === 'previous hand');
      if (matches.length > 1) throw new Error('More than one Previous Hand button is visible.');
      if (matches.length === 1) {
        const element = matches[0];
        const disabled = Boolean(element.disabled || element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true' || element.classList.contains('disabled'));
        return { element, disabled };
      }
    }
    throw new Error('Cannot find Previous Hand. Keep the individual hand history open.');
  }

  async function waitForHand(doc, { previous = null, settleMs = 500, timeoutMs = 25000, pollMs = 100 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastFingerprint = null;
    let stableSince = Date.now();
    let lastError = 'The hand panel has not loaded.';
    while (Date.now() < deadline) {
      try {
        const panel = findHandPanel(doc);
        if (!panel) throw new Error('The individual hand history is no longer visible.');
        if (panel.querySelector('[aria-busy="true"], [role="progressbar"], .loading, .spinner')) throw new Error('The hand is still loading.');
        const hand = extractHand(panel);
        const summaryNode = panel.querySelector('.player-results');
        const eventNodes = [...panel.querySelectorAll('.phase-group')];
        const summaryPayload = summaryNode.outerHTML;
        const eventPayload = eventNodes.map(node => node.outerHTML).join('');
        const hasNewSummary = !previous || panel !== previous.panel || summaryPayload !== previous.summaryPayload || !previous.summaryNode.isConnected;
        const hasNewEvents = !previous || panel !== previous.panel || eventPayload !== previous.eventPayload || previous.eventNodes.some(node => !node.isConnected);
        if (previous && (hand.id === previous.id || !hasNewSummary || !hasNewEvents)) {
          throw new Error('Waiting for a new hand and its rendered events.');
        }
        const fingerprint = panel.innerHTML;
        if (fingerprint !== lastFingerprint) { lastFingerprint = fingerprint; stableSince = Date.now(); }
        if (Date.now() - stableSince >= settleMs) {
          return { hand, snapshot: { id: hand.id, panel, summaryPayload, eventPayload, summaryNode, eventNodes } };
        }
      } catch (error) {
        lastError = error.message;
        lastFingerprint = null;
        stableSince = Date.now();
      }
      await sleep(pollMs);
    }
    throw new Error(`Timed out waiting for a complete hand: ${lastError}`);
  }

  Object.assign(P, { findHandPanel, extractHand, previousControl, waitForHand, describeFrameVisibility });
})();
