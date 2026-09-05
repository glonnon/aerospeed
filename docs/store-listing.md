# Store listing assets

## Chrome Web Store

**Name:** AeroSpeed — Strava duplicate finder + training coach

**Short description (132 chars):**
> Finds duplicate Strava activities, keeps the better copy, and cleans up. Includes a local training dashboard and optional AI coaching. Everything runs locally.

**Detailed description:**
AeroSpeed helps you take control of your Strava account:

- **Duplicate cleaning** — automatically detects duplicate activities on your My Activities page, highlights each copy with a badge (red = recommended delete, green = keep), and shows a side-by-side metric comparison. It always keeps the "better" activity based on data quality (GPS, heart rate, power) and metrics (distance, climbing, speed). Review every pair, then delete safely — either by manual links or one-click auto-delete using your logged-in session (throttled, with a local deletion log).
- **Training dashboard** — a Training Goals & Summary tab right inside the Strava page: activity calendar (click a day to see everything you did), distance-by-week charts, time-by-sport breakdown, year-in-review, and gear mileage. Includes a fitness model (CTL / ATL / TSB form tracking).
- **AI coach (optional)** — pick a goal and AeroSpeed generates a structured 4–13 week training plan (or pick from built-in marathon, FTP, century, VO2, 70.3 plans). It tracks your weeks, and with one click an AI evaluates your adherence and adjusts the plan. The AI can run fully on your machine (WebGPU), against a local Ollama server, or any OpenAI-compatible API you connect. Off by default; nothing leaves your device unless you enable a provider.
- **Find historical duplicates** — search by date range or by activity number to hunt duplicates anywhere in your history.

All processing is local. Your Strava data stays in your browser's extension storage.

**Privacy:** https://your-username.github.io/aerospeed/privacy (host PRIVACY.md somewhere public; the in-repo file is in the repo).

## AMO (Firefox) notes
- `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]` is set.
- AMO review requires completing their data-collection form; answer "no user data collected or transmitted" (the optional AI providers are opt-in and user-configured).