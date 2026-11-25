(async () => {
  const outcomes = [];
  const sample = document.querySelector('#hand-fixture').innerHTML;
  const runItTwiceSample = document.querySelector('#run-it-twice-fixture').innerHTML;
  const fixture = document.querySelector('#fixture');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const equal = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
  const test = async (name, body) => {
    try { await body(); outcomes.push({ name, ok: true }); }
    catch (error) { outcomes.push({ name, ok: false, error: error.message + '\n' + (error.stack || '') }); }
  };
  function mount(html = sample) {
    fixture.innerHTML = `<div><button>Previous Hand</button>${html}</div>`;
    return fixture.querySelector('.full-hand-container');
  }

  await test('extracts all four streets and exact monetary strings from the supplied real hand', () => {
    const P = globalThis.PokerTracker || {};
    assert(typeof P.extractHand === 'function', 'extractHand is not implemented');
    const hand = P.extractHand(mount());
    equal(hand.id, 'b4f44e71-cd65-47d6-9e34-1215fa2b3308', 'ID');
    equal(hand.started_at, '2026-11-25T05:00', 'time');
    equal(hand.table_name, 'Palmdale', 'table');
    equal(hand.players[0].starting_balance, '$1.26', 'balance');
    equal(hand.players[1].net_result, '-$1.26', 'net result');
    equal(hand.players[0].final_hand, ['Js', 'Jd', '6d', '6h', 'Ah'], 'final hand');
    equal(hand.phases.map(phase => phase.name), ['Preflop', 'Flop', 'Turn', 'River'], 'phases');
    equal(hand.phases[0].events[2].cards, ['Jh', '9h'], 'dealt cards');
    equal(hand.phases[0].events[3].cards, [null, null], 'hidden cards');
    equal(hand.phases[0].events[4].amount, '0.13', 'raise amount');
    equal(hand.phases[1].events.slice(-2).map(event => [event.action, event.action_code, event.amount]), [['Decline', 'DECLINE', null], ['Run it twice', 'ACCEPT_RUN_IT_TWICE', null]], 'special actions');
    equal(hand.phases[3].board, ['Js', '5s', 'Ah', 'Tc', '6d'], 'cumulative river board');
    equal(hand.phases[3].new_cards, ['6d'], 'new river card');
    assert(!Object.hasOwn(hand, 'raw_html'), 'captured hand contains structured data without page HTML');
  });

  await test('reads hands ending before the flop without inventing later streets', () => {
    const panel = mount();
    panel.querySelectorAll('.phase-group').forEach((phase, index) => { if (index > 0) phase.remove(); });
    const hand = PokerTracker.extractHand(panel);
    equal(hand.phases.length, 1, 'phase count');
    equal(hand.phases[0].events.length, 6, 'nonempty action rows');
  });

  await test('reads the supplied run-it-twice hand, its system announcement, and both complete boards', () => {
    const hand = PokerTracker.extractHand(mount(runItTwiceSample));
    equal(hand.id, 'ca64b12f-c28f-4764-824e-e62cfd4f2a4b', 'run-it-twice ID');
    equal(hand.started_at, '2026-11-25T03:10', 'run-it-twice timestamp');
    equal(hand.players.length, 4, 'all player summaries');
    equal(hand.phases[0].events.slice(-3).map(event => [event.player, event.action, event.type]), [
      ['Tassadar', 'Run it twice', 'action'],
      [null, 'Running it Twice', 'system'],
      ['GlidingMetal', 'Run it twice', 'action']
    ], 'announcement stays between the two player choices');
    equal(hand.phases[0].events.filter(event => event.action_code === 'ACCEPT_RUN_IT_TWICE').length, 2, 'both player acceptances');
    equal(hand.phases.map(phase => phase.name), ['Preflop', 'Flop', 'Turn', 'River', 'Table Cards Dealt', 'Table Cards Dealt', 'Table Cards Dealt'], 'source group order');
    equal(hand.phases[3].board, ['5d', 'Kh', '2d', 'Tc', '8s'], 'first complete board');
    equal(hand.phases.slice(4).map(phase => phase.board), [
      ['Jh', '7h', 'Td'],
      ['Jh', '7h', 'Td', '5h'],
      ['Jh', '7h', 'Td', '5h', '4s']
    ], 'second flop, turn, and river');
    equal(hand.phases.slice(4).map(phase => phase.new_cards), [['Jh', '7h', 'Td'], ['5h'], ['4s']], 'new cards in the second run');
    equal(hand.phases[6].events.slice(1).map(event => [event.player, event.action]), [
      ['GlidingMetal', 'Has Pair'], ['Tassadar', 'Has Pair'],
      ['GlidingMetal', 'Has Pair'], ['Tassadar', 'Has High card']
    ], 'all showdown results remain in order');
    assert(!Object.hasOwn(hand, 'raw_html'), 'two-run hand contains no raw HTML');
  });

  await test('still rejects genuinely incomplete player actions', () => {
    for (const missing of ['player', 'action']) {
      const panel = mount();
      panel.querySelector(`.phase-group tr .${missing}`).textContent = '';
      let error;
      try { PokerTracker.extractHand(panel); } catch (caught) { error = caught; }
      assert(error && /player action.*loading/i.test(error.message), `missing ${missing} must not be accepted as a system announcement`);
    }
  });

  await test('finds disabled Previous Hand and rejects a missing control', () => {
    const panel = mount();
    fixture.querySelector('button').disabled = true;
    equal(PokerTracker.previousControl(document, panel).disabled, true, 'disabled button');
    fixture.querySelector('button').remove();
    let error;
    try { PokerTracker.previousControl(document, panel); } catch (caught) { error = caught; }
    assert(error && /previous hand/i.test(error.message), 'missing control must fail');
  });

  await test('default reader requires 500 ms of stability using 100 ms checks', async () => {
    mount();
    const originalNow = Date.now;
    const originalTimeout = globalThis.setTimeout;
    let clock = 0;
    const delays = [];
    // Advance only the external clock/scheduler; exercise the real DOM reader.
    Date.now = () => clock;
    globalThis.setTimeout = (callback, milliseconds) => {
      delays.push(milliseconds);
      return originalTimeout(() => { clock += milliseconds; callback(); }, 0);
    };
    try {
      const result = await PokerTracker.waitForHand(document);
      equal(result.hand.id, 'b4f44e71-cd65-47d6-9e34-1215fa2b3308', 'complete hand returned');
      equal(clock, 500, 'stable hand captured after the requested window');
      equal(delays, [100, 100, 100, 100, 100], 'checks run at the requested interval');
    } finally {
      Date.now = originalNow;
      globalThis.setTimeout = originalTimeout;
    }
  });

  await test('does not mix a new header with events that render later', async () => {
    const panel = mount();
    const first = await PokerTracker.waitForHand(document, { settleMs: 30, timeoutMs: 1000, pollMs: 10 });
    panel.querySelector('h5').textContent = 'Hand Started: November 25, 2026 4:59 AM - Hand: a4f44e71-cd65-47d6-9e34-1215fa2b3308';
    panel.querySelector('.player-result .name').textContent = 'New hand player';
    const timer = setTimeout(() => { panel.querySelectorAll('.phase-group tr')[4].querySelector('.amount span').textContent = '0.99'; }, 180);
    const second = await PokerTracker.waitForHand(document, { previous: first.snapshot, settleMs: 30, timeoutMs: 1000, pollMs: 10 });
    clearTimeout(timer);
    equal(second.hand.players[0].name, 'New hand player', 'waited for new payload');
    equal(second.hand.phases[0].events[4].amount, '0.99', 'waited for new events independently of the summary');
  });

  await test('stops rather than exporting stale events when only the header changes', async () => {
    const panel = mount();
    const first = await PokerTracker.waitForHand(document, { settleMs: 20, timeoutMs: 1000, pollMs: 10 });
    panel.querySelector('h5').textContent = 'Hand Started: November 25, 2026 4:59 AM - Hand: a4f44e71-cd65-47d6-9e34-1215fa2b3308';
    let error;
    try { await PokerTracker.waitForHand(document, { previous: first.snapshot, settleMs: 20, timeoutMs: 180, pollMs: 10 }); } catch (caught) { error = caught; }
    assert(error && /timed out|stale|render/i.test(error.message), 'header-only changes must time out');
  });

  await test('rejects multiple visible history panels', () => {
    mount(sample + sample);
    let error;
    try { PokerTracker.findHandPanel(document); } catch (caught) { error = caught; }
    assert(error && /multiple|more than one/i.test(error.message), 'ambiguous selection must fail');
  });

  await test('ignores a hand panel inside a hidden embedding iframe', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:900px;height:700px;visibility:hidden';
    fixture.replaceChildren(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(sample);
    frame.contentDocument.close();
    await new Promise(resolve => setTimeout(resolve, 20));
    equal(PokerTracker.findHandPanel(frame.contentDocument), null, 'hidden embedding frame cannot be a history candidate');
    assert(typeof PokerTracker.describeFrameVisibility === 'function', 'frame embedding metadata is needed for cross-origin selection');
    const description = PokerTracker.describeFrameVisibility(window, target => target === frame ? 2 : 0);
    equal(description.children.find(child => child.frameId === 2).visible, false, 'parent reports hidden child');
    frame.remove();
  });

  await test('content script clicks through actual rendered hands and captures the inclusive range', async () => {
    mount();
    let receiver;
    globalThis.browser = { runtime: {
      getFrameId: () => 0,
      onMessage: { addListener: callback => { receiver = callback; } },
      sendMessage: async message => ({ ...message.info, frameId: 0 })
    } };
    const source = document.querySelector('script[src$="/tests/browser.js"]').src;
    const script = document.createElement('script');
    script.src = new URL('../extension/content.js', source).href;
    await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.body.append(script); });
    const headers = [
      'November 25, 2026 5:01 AM - Hand: b4f44e71-cd65-47d6-9e34-1215fa2b3308',
      'November 25, 2026 5:00 AM - Hand: a4f44e71-cd65-47d6-9e34-1215fa2b3308',
      'November 25, 2026 4:59 AM - Hand: c4f44e71-cd65-47d6-9e34-1215fa2b3308',
      'November 25, 2026 4:58 AM - Hand: d4f44e71-cd65-47d6-9e34-1215fa2b3308'
    ];
    let cursor = 0;
    const button = fixture.querySelector('button');
    function display() {
      const template = document.createElement('template');
      template.innerHTML = cursor === 2 ? runItTwiceSample : sample;
      const next = template.content.querySelector('.full-hand-container');
      next.querySelector('h5').textContent = 'Hand Started: ' + headers[cursor];
      fixture.querySelector('.full-hand-container').replaceWith(next);
    }
    button.onclick = () => { cursor++; display(); };
    display();
    const request = async type => {
      const result = await receiver({ pokerTracker: true, type });
      assert(result?.ok, result?.error || 'Content script did not respond');
      return result;
    };
    const saved = [];
    await request('reset');
    const result = await PokerTracker.collectHands({
      config: { from: '2026-11-25T04:59', to: '2026-11-25T05:00', folder: 'PokerTracker' },
      read: async () => (await request('read')).hand,
      advance: async () => (await request('advance')).advanced,
      save: async hand => saved.push(hand)
    });
    equal(saved.map(hand => hand.started_at), ['2026-11-25T05:00', '2026-11-25T04:59'], 'captured range');
    equal(saved[1].phases[3].board, ['5d', 'Kh', '2d', 'Tc', '8s'], 'first river in captured run-it-twice hand');
    equal(saved[1].phases[6].board, ['Jh', '7h', 'Td', '5h', '4s'], 'second river in captured run-it-twice hand');
    equal(result.reason, 'cutoff', 'stop reason');
    equal(result.inspected, 4, 'inspected count');
    equal(cursor, 3, 'number of Previous Hand clicks');
  });

  await test('popup remembers settings, sends the chosen range, and restores progress after reopening', async () => {
    const state = { config: { from: '2026-11-25T04:00', to: '2026-11-25T05:00', folder: 'PokerTracker/Bet88' }, run: { status: 'idle', inspected: 0, collected: 0 }, busy: false };
    let submitted = null;
    let retriedFolder = null;
    const browser = { runtime: { async sendMessage(message) {
      if (message.type === 'start') { submitted = message.config; state.run = { status: 'running', inspected: 5, collected: 3, current: '2026-11-25T04:30' }; state.busy = true; }
      if (message.type === 'retry') retriedFolder = message.folder;
      return { ok: true, state: structuredClone(state), preview: { hand: { table_name: 'Palmdale', started_at: '2026-11-25T05:00' } } };
    } } };
    async function openPopup() {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'width:420px;height:720px';
      fixture.replaceChildren(frame);
      const doc = frame.contentDocument;
      doc.open();
      frame.contentWindow.browser = browser;
      const root = new URL('../extension/', document.querySelector('script[src$="/tests/browser.js"]').src).href;
      doc.write('<base href="' + root + '">' + document.querySelector('#popup-fixture').innerHTML);
      doc.close();
      for (let attempt = 0; attempt < 150; attempt++) {
        if (doc.querySelector('#from')?.value) return { frame, doc };
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Popup did not initialize');
    }
    let opened = await openPopup();
    equal(opened.doc.querySelector('#folder').value, 'PokerTracker/Bet88', 'remembered folder');
    equal(opened.doc.querySelector('#from').value, '2026-11-25T04:00', 'remembered range');
    opened.doc.querySelector('form').dispatchEvent(new opened.frame.contentWindow.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 30));
    equal(submitted, { from: '2026-11-25T04:00', to: '2026-11-25T05:00', folder: 'PokerTracker/Bet88' }, 'start command');
    opened.frame.remove();
    opened = await openPopup();
    equal(opened.doc.querySelector('#collected').textContent, '3', 'restored collected count');
    assert(opened.doc.querySelector('#start').disabled, 'start is disabled during collection');
    assert(!opened.doc.querySelector('#stop').hidden && !opened.doc.querySelector('#stop').disabled, 'stop is available after reopening');
    opened.frame.remove();
    state.run = { status: 'save_failed', collected: 3, inspected: 5, error: 'Destination is blocked' };
    state.busy = false;
    opened = await openPopup();
    opened.doc.querySelector('#folder').value = 'PokerTracker/Corrected';
    opened.doc.querySelector('#retry').click();
    await new Promise(resolve => setTimeout(resolve, 30));
    equal(retriedFolder, 'PokerTracker/Corrected', 'retry uses the edited folder even before a change event saves it');
    opened.frame.remove();
  });

  document.querySelector('#results').textContent = outcomes.map(item => `${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.error ? '\n' + item.error : ''}`).join('\n');
  dump('POKER_TEST_RESULT:' + JSON.stringify(outcomes) + '\n');
})();
