# Privacy Policy — AeroSpeed

_Last updated: September 5, 2026_

This extension ("AeroSpeed", "we", "our") processes data almost
entirely on your own device. This policy explains what data is touched, where
it goes, and how to control it.

## 1. Short version

- No account, no sign-up, no server, no analytics, no advertising, no tracking.
- Activity data is read from your **own Strava session** in your browser and
  stored **only in your browser's local extension storage**.
- Your activity data is never sent anywhere by default.
- Optional "AI coach" providers are **opt-in** and send only what you approve
  to the endpoint you choose.
- You can delete all stored data at any time by removing the extension.

## 2. Data we process

| Data | Where it lives | Purpose |
|---|---|---|
| Activity list you've scanned (id, name, type, date, distance, moving time, elevation, GPS flag, device name when available) | `chrome.storage.local` in **your** browser | Duplicate detection, dashboard, charts, training plans |
| Your settings (units, thresholds, deletion mode, AI provider choice and keys, plan selection) | `chrome.storage.local` | Making the extension work the way you configured it |
| Deletion log (activity ids + timestamps you deleted) | `chrome.storage.local` | Your record of deletions, since Strava deletions are permanent |

All of the above stays in `chrome.storage.local` on your device. Remove the
extension and this data is removed with it.

## 3. Network activity

The extension talks to exactly these hosts, and only when needed:

- **`www.strava.com`** — reads your activity list and (if you enable
  auto-delete) deletes activities on your behalf, using your **logged-in
  session**. This is the same thing the Strava website does when *you* browse
  it. We have no separate account for you.
- **AI coach providers (only if you switch the AI coach on):**
  - **WebGPU mode** — downloads model weights from **huggingface.co** and
    wasm runtime files from **raw.githubusercontent.com** (both third-party
    CDNs). The content sent to the model is built and used *locally* on your
    device; your data is not transmitted back to us (we have no servers) — the
    model runs entirely in your browser.
  - **Ollama mode** — talks to a server **you run on your own machine**
    (default `http://localhost:11434`).
  - **OpenAI-compatible API mode** — sends the training summary and goal you
    approve to the base URL / API key **you** configure (e.g.,
    api.openai.com or any compatible endpoint you choose).
- No other third party receives your data.

## 4. Permissions explained

- `storage` — to persist your settings/cache locally.
- `host_permissions` for `https://*.strava.com` is scoped via content scripts
  (the extension only runs on the Strava training page); the listed network
  hosts are required only by the optional AI features described above.
- The background service worker exists only to open the AI coach page.

## 5. Your controls

- **Deletion mode** controls whether the extension can delete (default is
  *links only* — it never deletes without you confirming).
- **AI coach = Off** is the default; your data goes to no third party until
  you enable a provider and run a generation.
- **Remove the extension** to delete all stored data and revoke all access.

## 6. Children

We do not knowingly collect information from children. The extension is not
directed at children.

## 7. Changes

If this policy changes materially, the "last updated" date above will be
revised and the updated policy posted at the same location.

## 8. Contact

For privacy questions, open an issue on this repository.