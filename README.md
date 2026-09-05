# AeroSpeed

A browser extension that finds duplicate Strava activities, helps you keep the
better copy, and cleans up the rest — with a local training dashboard, a
fitness model, and goal-based AI coaching. All in your browser.

Works in **Chrome** (Manifest V3) and **Firefox**, runs **entirely in your
browser** by default, and connects to your Strava session the same way Strava's
own page does.

---

## Features

### Duplicate detection & cleanup
- **Automatic detection** — on page load the extension scans (recent by
  default), then stamps a **⧉ badge** on every duplicate row in *My
  Activities*: red = recommended delete, green = recommended keep. Hover for
  details, click to jump to the side-by-side review.
- **"Better" keeper logic** — scores each copy by data quality (GPS, HR,
  power, cadence) plus relative metrics (distance, climbing, speed,
  achievements, kudos, device trust) and always recommends which to keep.
- **Review UI** — per-pair metric tables, safe two-click confirms.
- **Delete modes** — *Links only* (copy delete URLs, safest) or *Auto-delete*
  (via your logged-in session, throttled queue, live progress, click-to-stop).
  Deletions are permanent — the extension logs every deletion locally.
- **Search all activities** — by date range or by activity number, so you can
  hunt down historical duplicates anywhere.

### Training dashboard (built into the training page)
- A third tab, **Training Goals & Summary**, sits next to *My Activities* /
  *Recently Deleted* with: activity calendar (click a day to see what you did),
  distance-by-week charts, time-by-sport donut, summary cards, and a
  **fitness model** (CTL / ATL / TSB).
- **Audit-safe**: matching never deletes when data doesn't clearly match
  (missing fields = no action).

### AI coach (optional, off by default)
Describe a goal ("increase VO2max in 3 months", "finish a century") and the
coach generates a 4–13 week *structured* plan — long-ride progression, weekly
hours multipliers, intensity sessions, tips — which plugs straight into the
plan tracker (week-by-week progress, adherence, next-workout). As weeks
complete it can **evaluate and adjust** the plan against your actual training.

Three providers, all local-first:
| Mode | How it works | Notes |
|---|---|---|
| **WebGPU** | Small model runs in your browser via [WebLLM](https://webllm.mlc.ai) | Chrome, needs a GPU. First run streams ~1–2 GB of weights |
| **Ollama** | Talk to a local [Ollama](https://ollama.com) / LM Studio server | Best quality-per-effort, any browser |
| **OpenAI-compatible API** | Any OpenAI-format endpoint (OpenAI, vLLM, etc.) | Set base URL, model, key in Settings |

Built-in plan library too: *First 100-mile ride*, *VO2max boost block*,
*Half-Ironman 70.3*.

### Units & preferences
Metric or imperial; scan scopes (100 / 3m / 6m / 1y / all); threshold tuning;
device trust ordering. Everything caches in `storage.local` (no re-scan every
visit).

---

## Install

### Chrome
1. `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. **Load unpacked** → select this folder
4. Open `https://www.strava.com/athlete/training` and refresh

### Firefox
1. `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on** → choose `manifest.json`
3. Refresh the Strava training page

> Temporary Firefox add-ons are removed when Firefox restarts. For a permanent
> install, package and self-host via [`web-ext`](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/).

---

## Getting started

1. Open **My Activities** on Strava → the extension auto-scans and caches your
   activities.
2. Click the orange **⧉⧉** (bottom-right) for duplicate groups, or open
   **Training Goals & Summary** for the dashboard.
3. Enable the **AI coach** in the plan section (Off / WebGPU / Ollama / OpenAI
   API), then **Generate with AI** → a small coach page opens and runs locally.

---

## How it stays private

- All reads go to strava.com **using your own logged-in session** — no account
  creation, no server, no analytics, no data leaves your machine beyond the
  exact requests the extension performs (and the optional provider you enable).
- Optional AI providers are **opt-in**; WebGPU mode never sends your data
  anywhere, Ollama/OpenAI modes only send the training summary + goal you
  approve to the endpoint you configure.
- See [PRIVACY.md](./PRIVACY.md) for the full policy.

---

## Legal & etiquette

- Deletions are **permanent** and cannot be undone by Strava support — review
  every pair before confirming.
- Unaffiliated with Strava. "Strava" is a trademark of Strava, Inc. This
  extension automates your own account's pages, the same approach as existing
  published Strava helper extensions. Strava's API does not offer activity
  deletion, which is why the extension drives the website session.

---

## Development

```bash
npm install        # vitest, web-ext (dev only)
npm test           # 120+ unit tests (matching engine, planner, fitness, units…)
npm run lint       # web-ext lint
npm run icons      # regenerate icon PNGs
```

**Layout**

```
background.js              # service worker (opens the coach tab)
manifest.json              # MV3, Chrome + Firefox
src/content/*              # content script (scanner, dedupe, plans, viz, …)
src/vendor/webllm.js       # vendored WebLLM runtime (for WebGPU mode)
coach.html / coach.js      # AI coach page (local LLM runner)
tests/                     # unit tests
```

---

## Roadmap

**Phase A — Data hygiene (safe deletions first)**
1. **Backup / export** — one-click CSV/JSON export of your activity index
   (id, name, date, distance, device) + the deletion log, so you have an
   offline inventory before touching anything.
2. **Pre-delete PR / segment warning** — before deleting, show which segment
   PRs and achievements would be lost (deleting loses them permanently).
3. **Pair enrichment** — fetch detail pages for suspected pairs only, to get
   device / HR / power / kudos / polylines for sharper keep/delete calls and
   better uncertainty handling.

**Phase B — Dashboard depth**
4. **Gear mileage tracker** — km/mi per bike and shoe computed from the index,
   with maintenance reminders.
5. **Year-in-review / monthly summaries** — sport totals, elevation, longest
   rides, all locally.
6. **Duplicate watch** — when you open the training page, diff the newest
   activities against the cached index and alert on fresh dupes at the source.

**Phase C — AI coach depth**
7. **Monitor-as-you-go** — auto-evaluate the plan (open the coach) when a week
   completes, instead of only on click.
8. **Fitness-aware prompts** — feed the LLM the CTL/ATL/TSB trend, not just
   week adherence, so adjustments respond to fatigue/form.
9. **Custom plan builder** — save/share your own 4–13 week plan templates;
   more built-ins (marathon block, FTP builder).
10. **JSON retry** — if the model returns malformed JSON, re-prompt once
    instead of failing (with 3B/7B model recommendations).

**Phase D — Publish**
11. **package.sh** — reproducible store-ready ZIP (excludes `tests/`,
    `node_modules/`, docs).
12. **Chrome Web Store + AMO listing** — privacy URL (this repo's Pages), icon
    set, screenshots, listing copy, review cycles.
13. **Optional: bundle WebLLM wasm hosted by us** to remove the
    raw.githubusercontent dependency for the WebGPU path.