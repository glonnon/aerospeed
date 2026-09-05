(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'openCoach') {
      try {
        const url = chrome.runtime.getURL('coach.html') + (msg.query ? '?' + msg.query : '');
        chrome.tabs.create({ url });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }
    return false;
  });
})();