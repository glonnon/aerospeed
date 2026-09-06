// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import '../src/content/ns.js';
import '../src/content/settings.store.js';
import '../src/content/polylines.js';
import '../src/content/dedupe.js';
import '../src/content/quality.js';
import '../src/content/scanner.js';
import '../src/content/deleter.js';
import '../src/content/settings.js';
import '../src/content/panel.css.js';
import '../src/content/panel.js';

const DS = globalThis.DedupeStrava;

describe('DOM helper', () => {
  it('selected:false must not mark an option as selected', () => {
    const sel = DS.h(
      'select',
      null,
      DS.h('option', { value: 'recent', selected: true }, 'Recent'),
      DS.h('option', { value: 'all', selected: false }, 'All')
    );
    document.body.append(sel);
    expect(sel.value).toBe('recent');
    expect(sel.options[1].hasAttribute('selected')).toBe(false);
  });

  it('selected:true marks exactly the right option', () => {
    const sel = DS.h(
      'select',
      null,
      DS.h('option', { value: 'a', selected: false }, 'A'),
      DS.h('option', { value: 'b', selected: true }, 'B')
    );
    document.body.append(sel);
    expect(sel.value).toBe('b');
  });
});

describe('panel', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  it('mounts the FAB and panel into a shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    DS.panel.mount(host);

    const fab = host.shadowRoot.querySelector('.ds-fab');
    const panel = host.shadowRoot.querySelector('.ds-panel');
    expect(fab).toBeTruthy();
    expect(panel).toBeTruthy();
    expect(panel.hidden).toBe(true);
    expect(host.shadowRoot.querySelector('.ds-hdr').textContent).toContain('AeroSpeed');
  });

  it('renders the settings drawer with all fields', () => {
    const host = document.createElement('div');
    document.body.append(host);
    DS.panel.mount(host);

    const drawers = [...host.shadowRoot.querySelectorAll('.ds-drawer')];
    const drawer = drawers.find((d) => d.querySelector('.ds-drawer-head').textContent.includes('Settings'));
    expect(drawer).toBeTruthy();
    const fields = drawer.querySelectorAll('.ds-field');
    expect(fields.length).toBeGreaterThanOrEqual(10);
    expect(drawer.querySelector('.ds-warning')).toBeTruthy();
    const searchDrawer = drawers.find((d) => d.querySelector('.ds-drawer-head').textContent.includes('historical'));
    expect(searchDrawer).toBeTruthy();
  });

  it('drawer reflects the stored scan scope, not the default', async () => {
    const saved = {};
    DS.ext = {
      storage: {
        local: {
          get: async (k) => ({ [k]: saved[k] }),
          set: async (o) => Object.assign(saved, o)
        }
      }
    };
    await DS.settingsStore.save({ scanScope: '365' });

    const host = document.createElement('div');
    document.body.append(host);
    DS.panel.mount(host);
    await new Promise((r) => setTimeout(r, 0));

    const sel = host.shadowRoot.querySelector('#ds-set-scanScope');
    expect(sel).toBeTruthy();
    expect(sel.value).toBe('365');
    DS.ext = undefined;
  });

  it('settings persist to storage.local (not sync)', async () => {
    const local = {};
    const sync = {};
    DS.ext = {
      storage: {
        local: {
          get: async (k) => ({ [k]: local[k] }),
          set: async (o) => Object.assign(local, o)
        },
        sync: {
          get: async (k) => ({ [k]: sync[k] }),
          set: async (o) => Object.assign(sync, o)
        }
      }
    };
    await DS.settingsStore.save({ timeWindowMinutes: 42 });
    expect(local.settings.timeWindowMinutes).toBe(42);
    expect(sync.settings).toBeUndefined();
    DS.ext = undefined;
  });

  it('toggles visibility', () => {
    const host = document.createElement('div');
    document.body.append(host);
    DS.panel.mount(host);
    const { state } = DS.panel;

    host.shadowRoot.querySelector('.ds-fab').click();
    expect(state.open).toBe(true);
    expect(host.shadowRoot.querySelector('.ds-panel').hidden).toBe(false);

    host.shadowRoot.querySelector('.ds-iconbtn[title="Close"]').click();
    expect(state.open).toBe(false);
    expect(host.shadowRoot.querySelector('.ds-panel').hidden).toBe(true);
  });

  it('toggles the settings drawer via the header gear and the AI card button', () => {
    const host = document.createElement('div');
    document.body.append(host);
    DS.panel.mount(host);
    const gear = host.shadowRoot.querySelector('.ds-iconbtn[title="Settings"]');
    expect(gear).toBeTruthy();
    const drawer = [...host.shadowRoot.querySelectorAll('.ds-drawer')].find((d) =>
      d.querySelector('.ds-drawer-head').textContent.includes('Settings')
    );
    gear.click();
    expect(drawer.open).toBe(true);
    gear.click();
    expect(drawer.open).toBe(false);
  });

  it('enriches a cached sparse row when a fuller copy arrives', () => {
    const host = document.createElement('div');
    document.body.append(host);
    DS.panel.mount(host);
    const st = DS.panel.state;
    st.activities = [
      { id: 'i1', name: 'R', type: 'Ride', startDateLocal: '2026-09-05T10:00:00', distanceM: null, movingTimeS: null, source: 'icu-dom' }
    ];
    DS.panel.mergeActivities([
      { id: 'i1', name: 'R', type: 'Ride', startDateLocal: '2026-09-05T10:00:00', distanceM: 40000, movingTimeS: 5400, source: 'icu' }
    ]);
    expect(st.activities).toHaveLength(1);
    expect(st.activities[0].distanceM).toBe(40000);
    expect(st.activities[0].movingTimeS).toBe(5400);
  });

  it('appends new ids without duplicating existing ones', () => {
    const host = document.createElement('div');
    document.body.append(host);
    DS.panel.mount(host);
    const st = DS.panel.state;
    st.activities = [{ id: 'i1', name: 'a', type: 'Ride', startDateLocal: '2026-09-05T10:00:00' }];
    DS.panel.mergeActivities([
      { id: 'i1', name: 'a', type: 'Ride', startDateLocal: '2026-09-05T10:00:00', distanceM: 40000 },
      { id: 'i2', name: 'b', type: 'Run', startDateLocal: '2026-09-04T10:00:00', distanceM: 5000 }
    ]);
    expect(st.activities.map((a) => a.id)).toEqual(['i1', 'i2']);
  });

  it('finds the training tab strip at the li level', () => {
    document.body.innerHTML = `
      <main>
        <ul class="tabs">
          <li class="tab selected"><a href="/athlete/training">My Activities</a></li>
          <li class="tab"><a href="/athlete/training?deleted=1">Recently Deleted</a></li>
        </ul>
        <div class="activities"><table><tbody><tr><td><a href="/activities/1">Ride</a></td></tr></tbody></table></div>
      </main>`;
    const found = DS.panel._findTabStrip();
    expect(found).toBeTruthy();
    expect(found.strip.tagName).toBe('UL');
    expect(found.mine.tagName).toBe('LI');
    expect(found.mine.textContent.trim()).toBe('My Activities');
    expect(found.deleted.textContent.trim()).toBe('Recently Deleted');
    expect([...found.strip.children].length).toBe(2);
  });

  it('ignores decoy My Activities headings without a Recently Deleted sibling', () => {
    document.body.innerHTML = `
      <header><nav><span>My Activities</span></nav></header>
      <main>
        <ul class="tabs">
          <li class="tab selected"><a href="#a">My Activities</a></li>
          <li class="tab"><a href="#b">Recently Deleted</a></li>
        </ul>
        <div class="activities"><table><tbody><tr><td><a href="/activities/1">Ride</a></td></tr></tbody></table></div>
      </main>`;
    const found = DS.panel._findTabStrip();
    expect(found).toBeTruthy();
    expect(found.strip.tagName).toBe('UL');
    expect(found.strip.querySelector('[data-ds-tab]')).toBeNull();
  });
});
