import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import '../src/content/ns.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

describe('manifest', () => {
  it('is manifest v3 with storage permission', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain('storage');
  });

  it('declares only files that exist', () => {
    for (const cs of manifest.content_scripts) {
      for (const f of [...cs.js, ...(cs.css || [])]) {
        expect(existsSync(resolve(root, f)), `missing file: ${f}`).toBe(true);
      }
    }
    for (const p of Object.values(manifest.icons || {})) {
      expect(existsSync(resolve(root, p)), `missing icon: ${p}`).toBe(true);
    }
  });

  it('targets the Strava training page and matches DS.VERSION', () => {
    expect(manifest.content_scripts[0].matches).toContain('https://www.strava.com/athlete/training*');
    const ns = readFileSync(resolve(root, 'src/content/ns.js'), 'utf8');
    expect(ns).toContain(`DS.VERSION = '${manifest.version}'`);
  });

  it('matches all intervals.icu routes the extension supports', () => {
    const patterns = manifest.content_scripts.flatMap((cs) => cs.matches);
    const globToRe = (pattern) => {
      const parts = [];
      let i = 0;
      for (const ch of pattern) {
        if (ch === '*') parts.push('[\\s\\S]*');
        else parts.push(ch.replace(/[\\^$+.(){}[\]|]/g, '\\$&'));
      }
      return new RegExp('^' + parts.join('') + '$');
    };
    for (const u of [
      'https://intervals.icu/athletes',
      'https://intervals.icu/athletes?page=1',
      'https://intervals.icu/athlete/i12345/activities',
      'https://intervals.icu/activities'
    ]) {
      expect(patterns.some((p) => globToRe(p).test(u)), `no match for ${u}`).toBe(true);
    }
  });

  it('has Firefox gecko settings', () => {
    expect(manifest.browser_specific_settings.gecko.id).toBeTruthy();
    expect(manifest.browser_specific_settings.gecko.data_collection_permissions.required).toContain('none');
  });
});

describe('namespace', () => {
  it('exposes DedupeStrava global', () => {
    expect(globalThis.DedupeStrava.VERSION).toBe(manifest.version);
  });
});
