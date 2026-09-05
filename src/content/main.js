(() => {
  const DS = (globalThis.DedupeStrava = globalThis.DedupeStrava || {});

  function boot() {
    if (document.getElementById('ds-dedupe-root')) return;
    const root = document.createElement('div');
    root.id = 'ds-dedupe-root';
    (document.body || document.documentElement).appendChild(root);
    DS.panel.mount(root);
    console.info(`[dedupe] content script v${DS.VERSION} loaded`);
    DS.panel.integrate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
