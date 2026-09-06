# AeroSpeed Roadmap

Ideas are grouped by theme and rough priority. Status:

- **☑ done**
- **◐ building**
- **〇 planned**
- **✗ parked** (needs research or a big lift — see reason)

Legend for effort: S = small, M = medium, L = large.

---

## 1. Data quality & cleanup (extends the dedup core)

- **☑ Truncated / truncated-GPS detector** — folded into the **Data quality**
  report: decodes each GPS polyline and flags routes whose decoded path is
  well under the recorded distance or has very few points.
- **☑ Bad-data sweeper** — the **Data quality** report flags implausible speeds,
  suspicious HR, and truncated GPS, with one-click links to each activity.
- **☑ Missing-data report** — same report flags activities with distance but
  no GPS trace.
- **✗ Name / description bulk tools** — rename needs write-through to the
  Strava web API using the session token; implementable but unvalidated
  without a live account. Revisit with a real session.
- **☐ Public / private audit** [S] — list public activities with
  home-location heatmap risk; one-click bulk privacy change. Not started.

## 2. Training dashboard (builds on CTL/ATL/TSB + viz)

- **☑ Power / HR trends** — monthly peak-average HR and power lines (uses HR /
  power captured on your devices; Intervals.icu carries the most).
- **☑ Ramp-rate & ACWR guardrails** — weekly load change + acute:chronic
  workload alerts.
- **☑ Monotony / strain score** — Foster-style monotony (mean/SD of daily
  load) + training strain, integrated with the guardrails card.
- **☑ Time-of-day / day-of-week heatmap** — "When you train" 7×24 grid.
- **☑ Streaks & consistency** — current/longest streak, consistency %, gap.
- **☑ Goal progress** — year distance & climbing goals with pacing vs schedule.

## 3. Gear & maintenance (extends gear mileage)

- **☑ Maintenance reminders** — user-set service intervals, "since service"
  tracking, OVERDUE / due-soon highlighting.
- **☑ Per-bike performance comparison** — average speed and total climbing
  shown per gear in the mileage card.

## 4. Social & fun

- **☑ Year-in-review share card** — downloadable PNG (canvas) with this year's
  stats.
- **✗ Personal records timeline** — PR/achievement counts are only populated by
  detail-page enrichment, so data is too sparse to be useful. Parked.
- **✗ Local legends / segment stats** — needs segment data; heavier lift. Parked.

## 5. AI coach (extends the LLM piece)

- **☑ Race-day predictor** — dashboard card estimating a finish time from your
  best recent haul, scaled by distance with CTL/form correction.
- **✗ Auto weekly review** — needs background scheduling (alarms) plus the
  coach channel; design decision required. Parked.
- **✗ Weather-aware plan swap** — needs a forecast API integration. Parked.

## 6. Cross-platform / infrastructure

- **☑ Intervals.icu support** — full adapter (scan/delete/meta via its own
  `/api/...` endpoints) for the athlete Activities tab.
- **✗ Garmin Connect support** — no session-cookie API like Intervals.icu;
  would need a deep reverse-engineering effort plus a live account. Parked.
- **✗ Ride with GPS support** — needs OAuth/API-key flow; not a session adapter.
  Parked.
- **✗ Cross-platform duplicate check** — requires data from two hosts at once;
  our extension only runs on one host per page load. Needs multi-tab design.
  Parked.
- **✗ Scheduled auto-export / backup** — the background worker can't scrape a
  logged-in page; would need the panel open. Manual Export exists. Parked.

---
## Notes

- Everything runs locally in your browser using your logged-in session.
- Deterministic, tested metrics live in `fitness.js` / `viz.js`; all UI lives
  in `panel.js`.