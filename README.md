# Ad Budget Optimizer

Tracks ad spend, leads, and won jobs per source (Google LSA, Meta, TextBlast, …),
computes ROAS (recurring jobs counted at first-year value), and gives a weekly
recommendation for how to shift daily budget between sources.

Leads can also arrive automatically from your CRM (QuoteIQ) via webhook — they
show up in the Leads tab flagged **⚠ pick source**; tap one to assign which ad
it came from so it counts toward that source's ROAS.

## Deploy on Railway

1. Railway → **New Project → Deploy from GitHub repo** → pick this repo.
   Railway detects Node and runs `npm start` automatically.
2. **Add a volume** (Service → Settings → Volumes) mounted at `/data`, and set
   the environment variable `DATA_DIR=/data`. Without this, your data is wiped
   on every redeploy.
3. (Recommended) Set `APP_PASSWORD` to any password. The app asks for it once
   per device; the webhook endpoint stays open so the CRM can always deliver.
4. Settings → Networking → **Generate Domain** to get your public URL.

## Hook up QuoteIQ

In QuoteIQ → Settings → Automation → Outbound API (Webhooks), add:

```
https://YOUR-APP.up.railway.app/api/webhooks/quoteiq
```

Subscribe it to lead / customer / scheduling events. Every event lands in the
app within a minute (it checks for new CRM leads on open, on focus, and every
60 seconds).

To see exactly what QuoteIQ sent (for debugging), open
`/api/inbox/log` on your app URL.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/webhooks/:source` | Receive CRM webhooks (any JSON or form body) |
| GET/PUT | `/api/state` | App state sync (requires `X-App-Key` if `APP_PASSWORD` set) |
| GET | `/api/inbox` | Unconsumed CRM events |
| POST | `/api/inbox/consume` | Mark CRM events consumed |
| GET | `/api/inbox/log` | Last 25 raw webhook payloads |
| GET | `/healthz` | Health check |

## Run locally

```
npm install
npm start        # http://localhost:3000
```

`index.html` also works standalone (opened as a file or on GitHub Pages) —
it falls back to browser-only storage, without CRM sync.
