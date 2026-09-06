(() => {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const DS = (root.DedupeStrava = root.DedupeStrava || {});

  DS.VERSION = '0.25.4';

  DS.ext =
    typeof browser !== 'undefined' && browser?.runtime?.id
      ? browser
      : typeof chrome !== 'undefined'
        ? chrome
        : undefined;

  DS.debug = (...args) => {
    if (DS.DEBUG) console.debug('[dedupe]', ...args);
  };

  DS.h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'selected') {
        if (v) el.setAttribute('selected', '');
      } else if (k === 'value') el.value = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
})();
