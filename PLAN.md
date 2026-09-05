# Strava Duplicate Finder & Cleaner — Plan

Browser extension (Chrome MV3 + Firefox WebExtension) that finds duplicate activities on
strava.com, recommends the "better" one to keep, and deletes the other — with user
confirmation and a no-delete safety mode.

## Decisions

| Decision | Choice |
|---|---|
| Deletion | **Both modes, via setting**: (a) manual-links-only mode (default, safe), (b) auto-delete via web session (`POST /activities/{id}` + `_method=delete` + CSRF) |
| Audience | Publish to Chrome Web Store **and** Mozilla Add-ons (AMO) |
| GPS matching | **Both**: summary polyline comparison always; optional full GPS-stream refinement behind a setting |
| Reading data | Web session (same-origin fetch with cookies) — no OAuth/API keys for v1. Official API variant deferred |
| Stack | Vanilla JS (ES modules), Manifest V3, `browser`/`chrome` feature detection, vitest for pure logic |

## Research findings

### The delete problem (the key constraint)
- Official Strava API v3 has **no delete endpoint** (removed from docs; the
  changelog shows it was added Jan 2014 but the swagger spec no longer lists it;
  Strautomator's author confirms API deletion is not possible).
- Working paths:
  1. **Web endpoint (what strava.com's own UI does):**
     `POST https://www.strava.com/activities/{id}`
     body: `_method=delete&authenticity_token=<csrf>`
     cookies: logged-in session. CSRF token from `<meta name="csrf-token">`
     on any strava.com page. Success = 302 redirect to `/athlete/training`.
     Verified in `pR0Ps/stravaweblib` (stable since ~2019) and
     `cagrieti/strava-activity-cleaner`.
  2. Undocumented API: `DELETE /api/v3/activities/{id}` with OAuth bearer
     (used by tapiriik). Backup path only.

### Reading activities (web session, no API app needed)
- My Activities page (`/athlete/training`) paginates via
  `GET /athlete/training_activities?page=N&per_page=20&...` returning HTML rows
  with embedded `data-react-class="ActivityRow" data-react-props="{json}"`.
  Fields: id, name, distance, moving/elapsed time, elevation, type, start date,
  device, commute/trainer/private flags (same parsing approach as stravaweblib).
- Detail pages (`GET /activities/{id}`) embed full JSON: avg/max speed, HR,
  power, cadence, calories, suffer score, map polyline, device name, kudos/
  comment/photo counts, PR/achievement counts. Fetched only for suspected pairs.

### Reference projects / docs
- https://github.com/pR0Ps/stravaweblib — web session parsing + delete
- https://github.com/jeffutter/strava-duplicate-cleaner — matching thresholds
- https://developers.strava.com/docs/rate-limits/ — only relevant if we add API mode
- Why duplicates happen: double device sync (watch + phone), Zwift + Garmin,
  manual + device upload, DST clock shifts (±1h).

## Duplicate matching algorithm

Two activities are duplicates **only if all** pass (defaults configurable):

1. **Time gate:** |start_time_a − start_time_b| ≤ 10 min, also checking ±1h
   (DST) shifted variants.
2. **Type:** same sport type (setting: allow related types, e.g.
   VirtualRide↔Ride for Zwift+head-unit cases).
3. **Metric similarity** (all must pass):
   - distance within 5%
   - moving_time within 5%
   - time-interval overlap ≥ 80%
4. **Route check:** summary polyline similarity ≥ threshold
   (start/end within ~200 m + sampled-point shape similarity). Activities
   without GPS (manual/indoor) skip this stage and rely on 1–3.
5. **Optional deep check (setting):** full GPS stream comparison — handles
   partial recordings (containment) and clock offsets. Activity page provides
   streams; exact web endpoint to be confirmed by inspecting DevTools on the
   activity page during M2.

**If any stage fails → not duplicates → never delete either.**

## "Better activity" scoring (keep the winner)

Configurable weights; higher score wins. Ties within epsilon → treat as
uncertain, do NOT preselect deletion.

```
+10  has heart rate data
+10  has power data
+8   has GPS / map data
+5   has cadence
+5   device-recorded (vs manual)          manual activities: −10
+5   device trust: Garmin/Wahoo/Polar/Suunto (+5), phone app (+2)
+3   more total_elevation_gain (scaled comparison)
+3   more achievements/PRs (segments are lost on delete!)
+2   social value: kudos + comments + photos
+2   longer moving_time (scaled)
```

Always show a side-by-side metric table; recommendation pre-filled only when
one activity clearly wins.

## Safety design (Strava deletions are permanent)

1. Default mode = **manual links only**. Auto-delete is an opt-in setting.
2. Three steps: **Scan → Review → Execute**. Review shows every pair; each
   deletion requires an explicit checkbox.
3. **Settings widget on page:** gear button in the panel header opens a drawer
   inside the overlay — no separate options page trip. Editable live:
   - matching thresholds (time window, distance/duration tolerance, overlap,
     polyline threshold)
   - related-type matching toggle (e.g. VirtualRide↔Ride)
   - deep GPS stream check toggle
   - deletion mode: links-only / auto-delete (with inline warning)
   - device trust ranking (drag order)
   Changes save to `storage.sync` and apply to the next scan immediately;
   changing thresholds marks existing results stale ("re-scan needed").
4. Never auto-delete without confirmation; recommendation only pre-fills.
5. Deletes run through a throttled queue (2–5 s spacing), live progress,
   abort button, and a local deletion log (storage) since Strava has no undo.
6. Sanity guards: refuse to act on huge unexpected batches (>25% of scanned
   activities flagged) without typing a confirmation phrase.

## Architecture

```
manifest.json          # MV3, works in Chrome + Firefox (gecko id, data_collection_permissions)
src/
  background.js        # service worker: badge, message router (thin)
  content/
    main.js            # bootstraps on strava.com/athlete/training*
    scanner.js         # paginate + parse ActivityRow props, cache in storage.session
    dedupe.js          # pure matching algorithm
    quality.js         # pure "better activity" scoring
    polylines.js       # decode Google polyline, similarity helpers
    deleter.js         # CSRF fetch + queue + deletion log
    panel.js           # overlay UI: scan/review/execute
    settings.js        # in-page settings widget (drawer inside the panel)
    settings.store.js  # load/save thresholds & prefs to storage.sync, live-apply
    panel.css
tests/
  fixtures/            # captured ActivityRow JSON + activity page JSON
  dedupe.test.js
  quality.test.js
  polylines.test.js
```

- No external hosts, no analytics, no data leaves the browser (privacy policy:
  "all processing local, only talks to strava.com as your own session").
- Cross-browser: feature-detect `browser` vs `chrome`; no browser-specific APIs
  needed for v1 (content script + storage + runtime messaging only).

## Store publishing notes

- Name must not imply endorsement (e.g. "Dedupe for Strava" + disclaimer).
- CWS: disclosures for activeTab/host permission on strava.com.
- AMO: `browser_specific_settings.gecko.id` + `data_collection_permissions.required: ["none"]`.
- Listing should state clearly: deletion is permanent, tool recommends but the
  user confirms every deletion.
- ToS note: web-session automation is the same approach used by existing
  published Strava helper extensions; official-API deletion does not exist.

## Milestones

- **M1** Scaffold: manifest, content script injects empty panel on
  strava.com/athlete/training, loads in both Chrome & Firefox.
- **M2** Scanner: paginate all activities via web session, parse props, cache,
  show count in panel. (Also: capture DevTools trace for streams endpoint.)
- **M3** Matching + scoring + polyline utils, unit-tested against fixtures.
- **M4** Review UI: duplicate groups, side-by-side table, keep/delete choices;
  in-page settings widget (drawer) with live-apply + stale-results flagging;
  manual-links mode complete (copyable delete URLs).
- **M5** Auto-delete queue (opt-in): CSRF fetch, throttling, progress, log.
- **M6** Icons, i18n, packaging + store listings.
