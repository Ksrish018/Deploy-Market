# Market Signal Triage

A working build of the *Market Signal Triage* PRD: paste market items in, get a
short, owner-approved action list out — with a live workflow graph, editable
scoring, and an Excel brief for the next meeting.

## Quick start

**Truly the easiest — one HTML file, no install, no server, works offline:**
double-click **`MarketSignalTriage-Offline.html`** and it opens straight in
your browser, fully functional. See "The offline single-file build" below
for exactly what this trades off.

**Or, with a real shared backend — double-click `Start App.bat`** — installs dependencies the first
time, starts everything, and opens your browser automatically. Double-click
`Stop App.bat` to shut it down.

**Or a single .exe, no browser tab typing needed:** double-click
`MarketSignalTriage.exe` in the project root (keep its sibling `public`
folder next to it) — it starts the whole app and opens your browser itself.
Windows may show a "Windows protected your PC" SmartScreen prompt the first
time since it isn't code-signed — click **More info → Run anyway**. See
"Building the single .exe" below for how it's made and how to rebuild it
after a code change.

**Or from a terminal:**
```bash
npm run install:all   # installs server + client dependencies
npm run dev            # runs the API (port 4001) and the app (port 5173) together
```

Open **http://localhost:5173**. That's the whole app — no accounts, no cloud
setup, no API keys required.

To run the two halves separately: `npm run dev:server` and `npm run dev:client`.

## What's actually running

| Piece | Tech | Notes |
|---|---|---|
| Client | React + Vite + TypeScript + Tailwind v4 + React Flow (`@xyflow/react`) | The live workflow graph, all 7 screens from the PRD's route inventory |
| Server | Node + Express, ES modules | REST API under `/api`, proxied by Vite in dev |
| Storage | A single JSON file (`server/src/data/db.json`) | See "Why no database" below |
| Classifier | A deterministic, local rule engine (`server/src/classifier.js`) | No external API calls — see "Why not a live LLM" below |

## The decisions behind this build

You asked for the app to be **fast and reliable**, and for the context-keeper
to be able to **assign owners themselves**, with a final **Excel table** and a
**run log for the next meeting**. Four choices flow from that:

1. **Classifier = deterministic rule engine, not a live Claude API call.**
   Category keywords, a strategic-hiring reclassification rule, and weighted
   scoring all run in-process in milliseconds, with zero network calls, zero
   API cost, and the same input always producing the same output. That's what
   "reliable" means here — nothing to retry, rate-limit, or silently drift.
   The trade-off: it's less nuanced than an LLM on genuinely ambiguous
   phrasing. If you outgrow it, `classifyItem()` in `server/src/classifier.js`
   is the one function to swap or augment with a real API call.
2. **Storage = a single JSON file, not a database.** The dataset is a weekly
   batch (tens to low hundreds of items) and Node is single-threaded, so a
   synchronous, atomically-written JSON file (`db.js`) gives race-free
   persistence with nothing to install, configure, or lose a connection to.
   It lives at `server/src/data/db.json` — back it up like any file, or open
   it directly if you ever need to inspect state by hand.
3. **Permissions = a role selector, not real auth.** Every role in the top bar
   (Collector, Context-keeper, Leadership, Checkpoint owner, Signal owner) can
   do everything — compile a week, edit weights, reassign an owner, confirm a
   signal, approve a brief. The selector exists so every action is attributed
   correctly in the audit trail and the brief's sign-off record, not to gate
   anything. This matches the PRD's own hackathon-MVP note ("roles can be a
   simple selector, no real auth") and your instruction to give the app full
   permissions.
4. **Owners = role labels, editable two ways.** The PRD's owner-mapping table
   (§10) is the default: each signal type routes to a role like "Pricing/
   Finance lead." The **context-keeper can now override this in two places**:
   - **Priorities & Weights → Owner routing table** — edit the *default*
     owner/action/window for a signal type going forward.
   - **Review Queue → Reassign** — override a *single* signal's owner, action,
     tier, or deadline, with a required reason that's kept in that signal's
     edit history and the audit log.

## The pipeline, end to end

1. **Intake** — paste one item or several (blank line or `---` separated).
   Near-duplicate items (within 30 days) are merged into the original instead
   of creating a new row, and bump its severity slightly — a repeated mention
   should raise urgency, not clutter the queue.
2. **Mark week compiled** — the Stage-0 readiness gate. Until this happens,
   analysis is blocked; if the cutoff passes first, the Dashboard's gate node
   turns **blocked** and offers a one-click "Assign collection" action that
   creates a tracked task for the Collector.
3. **Priorities & Weights** — set 3–5 free-text priorities for the cycle, and
   tune the weight profile (category weights, the ×1.5 priority multiplier,
   tier thresholds). Publishing creates a new numbered, reversible version;
   every signal records which version scored it.
4. **Run analysis** (Dashboard) — classifies every pending item: filters out
   non-signals, scores the rest, reclassifies strategic hiring into Product,
   and writes back an owner/action/deadline from the routing table. This is
   also where a **run log** entry is created (see below).
5. **Review Queue** — confirm, dismiss, or reassign each proposed signal. The
   reviewer shown (Collector/Associate vs. Checkpoint owner) reflects the
   PRD's tiering by severity, though — per the permissions decision above —
   anyone can act.
6. **Priority Queue** — confirmed signals sorted by severity; select some or
   approve all at once.
7. **Brief** — generate the Weekly Market Signal Brief from approved signals,
   preview it, and export it.

## The two deliverables you asked for

**The Excel table.** Brief → *Export Excel (.xlsx)* produces a workbook with:
- **Action Table** — the primary sheet: tier, owner, suggested action,
  deadline, why-it-matters, confidence, confirmed-by, and whether it was
  manually reassigned, colored by tier.
- **Cycle Info & Sign-off** — priorities and weight-profile version(s) in
  force, plus who approved the cycle and when.
- **Run Log** — every analysis run this cycle, for the next meeting.
- **Non-Signals (Logged)** — what was filtered out, and why, for transparency.

**The run log.** Every time *Run analysis* fires, a run-log entry is recorded
(items processed, signals created, non-signals, tier breakdown, who triggered
it) — visible on the **Brief** page, exportable on its own via *Export run log
(.xlsx)* even before anything is approved, and durably written as a Markdown
file under `server/src/data/logs/` independent of the JSON store.

## Assumptions worth knowing about (documented, not hidden)

- **Deadlines.** `response_window` → a concrete date: `same_day` = next
  calendar day 17:00; `this_week` = this Friday 17:00 (next Friday if it's
  already the weekend); `background` = 21 days out. Edit any signal's
  deadline directly if these defaults don't fit.
- **Metrics are in-app proxies**, not external surveys — e.g. "actionable
  signal rate" is confirmed ÷ reviewed, and "beaten-by-customer" is inferred
  from source type. The Dashboard's metrics note says so; don't over-read
  precision into them.
- **The batched exec digest** (PRD §Stage 6) is rendered in-app on the
  Dashboard, grouped by exec bucket — there's no outbound email/Slack in this
  build (matches the PRD's own non-goals for v1).

## The offline single-file build

`MarketSignalTriage-Offline.html` is the entire app — UI, classifier,
scoring, Excel export — compiled into one ~1MB HTML file with no server, no
build step, no install. Open it from anywhere: double-click it, email it,
put it on a USB stick, open it on a phone. It works completely offline.

**The trade-off, stated plainly:** this file has no backend. It stores all
its data in the browser's own `localStorage`. That means:
- Each device/browser that opens it has its **own independent copy** of the
  data — there is no sharing or syncing between people or devices.
- Clearing browser data (or opening in a private/incognito window) wipes it.
- It's a personal/offline tool, not a substitute for the shared, deployed
  app — use Vercel or Fly.io (below) when multiple people need to see the
  same cycle.

**How this works, technically:** the exact same client code runs in two
modes, chosen automatically at runtime by checking the page's protocol —
opened via `file://` (this build), it runs the classifier, scoring, and all
persistence locally (see `client/src/local/`); served over `http(s)` by an
actual backend (dev, `.exe`, Docker, Vercel), it calls the real `/api/*`
routes exactly as before. Both paths are implemented once each
(`client/src/api/localClient.ts` and `remoteClient.ts`) behind a single
dispatcher (`client/src/api/client.ts`) that every page imports — so neither
mode can silently regress the other.

One minor, honest limitation: the offline build's Excel export uses the
browser-side SheetJS library instead of the server's `exceljs`, since
`exceljs` is Node-only. The exported workbook has identical data and sheet
structure, just without the tier color-coding the server-generated version
has.

**To rebuild it** after a code change: `npm run build:vercel` (despite the
name, this just builds the client) — then copy `client/dist/index.html` to
`MarketSignalTriage-Offline.html` at the project root.

**To reset its data:** open it and use the same "Reset data" button as
everywhere else in the app — or clear that page's site data in your browser
if you don't have the file open.

## Deploying on Vercel

This deploys the whole app (frontend + API) as one Vercel project — no
separate backend host needed. Vercel's serverless functions have no
persistent local disk, so this path stores data in a real Postgres database
instead of the local JSON file. Local dev, the `.exe`, and the Fly.io/Docker
deploy are completely unaffected — they never set the environment variable
that switches this on, and keep using the fast local file exactly as before.

**One-time setup:**
1. Push this repo to GitHub (or GitLab/Bitbucket) and import it in the
   [Vercel dashboard](https://vercel.com/new) — or run `vercel` from the
   project root with the [Vercel CLI](https://vercel.com/docs/cli) instead.
2. In the project's **Storage** tab, add a Postgres database (Vercel's
   current integration is powered by Neon) and connect it to the project.
   Vercel injects a `DATABASE_URL` (or `POSTGRES_URL`) environment variable
   automatically — the app picks either up with no extra configuration.
3. Deploy (automatic on every push once imported, or `vercel --prod` from
   the CLI).

That's it — `vercel.json` already routes `/api/*` to the Express app (as a
single serverless function, via `api/index.js`) and everything else to the
built client, with an SPA fallback so client-side routes like `/intake`
work on a hard refresh.

**First request after linking the database** creates the `app_state` table
and seeds a fresh cycle automatically — no manual migration step.

**Known trade-off:** the whole app state (all cycles, signals, briefs, audit
log) is stored as a single JSON blob in one Postgres row for simplicity —
fine at the scale this app is built for (weekly batches, a small team), but
if the audit/run-log history grows very large over a long time, splitting
into proper per-record tables would be the next step. Not needed to get a
reliable multi-user deployment working today.

## Deploying online (Fly.io) so others can test it

The app is one Express server that can serve itself plus the built client, so
it deploys as a single container. `Dockerfile`, `.dockerignore`, and
`fly.toml` are already set up for this — no auth gate is added (matches the
same no-real-auth model as local use); don't paste anything into a deployed
instance you wouldn't want any tester to see or edit, since anyone with the
link has full access.

```bash
# One-time setup
# 1. Install flyctl: https://fly.io/docs/flyctl/install/
fly auth login

# 2. Register the app (change the name in fly.toml first if this one is taken)
fly apps create market-signal-triage

# 3. Create the persistent volume that keeps your data across restarts/redeploys
fly volumes create msdata --region iad --size 1

# 4. Build and deploy
fly deploy
```

`fly deploy` prints the live URL when it finishes (something like
`https://market-signal-triage.fly.dev`) — share that with testers. Every
subsequent code change just needs `fly deploy` again; the volume (and your
data on it) persists across deploys. To reset the deployed data, `fly ssh
console` in and delete the contents of `/data`, or `fly volumes` list/destroy
and recreate it.

The `[[vm]]` block in `fly.toml` sizes the smallest shared instance, and
`min_machines_running = 0` lets it scale to zero (and cold-start on the next
request) when idle, to keep it cheap/free-tier-friendly for a testing group.

## Building the single .exe

```bash
npm run build:exe
```

This builds the client, bundles the server into one file, and uses Node's
built-in **Single Executable Application** feature to produce
`MarketSignalTriage.exe` at the project root, alongside a `public` folder it
needs (the built web app's static files) — ship both together. Re-run this
command any time you change the code and want a refreshed .exe. It reuses
the Node.js already installed on this machine rather than downloading or
compiling one, which is what makes this fast and dependency-free.

**Why a sibling `public` folder instead of one fully self-contained file:**
the .exe embeds the entire server and all its dependencies, but static
assets (the built React app's JS/CSS/HTML) are kept as real files next to it
rather than embedded — simpler and more reliable than Node SEA's per-file
asset-embedding API for a folder this size. The `data` folder (your saved
cycles, signals, briefs) is created next to the .exe on first run, the same
way — so backing up or resetting the app means backing up or deleting that
one folder.

## Uploading a spreadsheet in Intake

Besides pasting text, the Intake tab accepts a **.xlsx, .xls, or .csv** file:
drop it in the dashed upload zone below the paste box. Put one item per row
(a header row like "Item" or "Text" is detected and skipped automatically);
if a row has several columns, they're joined with " — " into one item. All
uploaded rows use the source-type dropdown selected at upload time.

## Resetting to a clean slate

Delete `server/src/data/db.json` (and optionally `server/src/data/logs/`) and
restart the server — it reseeds a fresh current-week cycle with the default
weight profile and owner map automatically. Running the `.exe`, delete the
`data` folder next to it instead — same effect.

## The two demo moments (straight from the PRD)

1. **Priorities & Weights**: raise `product_feature`'s weight, publish, hit
   *Re-score pending signals* — watch a pending product item jump tier.
   Paste "Competitor X hired 5 new security engineers including a new VP of
   Security" and watch it get reclassified from Hiring/HR into Product
   automatically.
2. **Dashboard**: let a cycle's cutoff pass without compiling — the gate node
   turns red/blocked with a one-click "Assign collection" action.
