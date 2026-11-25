'use strict';
const pokerTrackerController = PokerTracker.createController(browser);
browser.runtime.onMessage.addListener((message, sender) => {
  if (!message?.pokerTracker) return undefined;
  return pokerTrackerController.handle(message, sender);
});
