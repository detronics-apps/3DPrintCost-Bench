# Handoff — 3DPrintCost Bench

_Last updated: 2026-09-05. For the next chat/session picking up this project._

## What this is
**3DPrintCost Bench** — a browser-only tool for **costing, quoting, production
scheduling and invoicing of 3D-printed parts**. It runs entirely in the browser:
**no backend, no build step, no dependencies, no network once the page has
loaded.** All data lives in the browser (`localStorage`) and, optionally, a
Google-Drive-synced file. Design ethos: _"nothing leaves the device."_

There are two front doors:
- `index.html` — the internal app (the company: estimator, projects, catalogues,
  inventory, quotes/invoices, dashboard, schedule, settings).
- `quote.html` — the **client portal**: a cut-down estimator a customer opens
  from a link, fills in, and sends back as a request. Full parity with the
  internal estimator, but hides cost/margin.

## Where it lives / how it's published
- **GitHub:** https://github.com/detronics-apps/3DPrintCost-Bench (public)
- **Live site (GitHub Pages):** https://detronics-apps.github.io/3DPrintCost-Bench/
- **Client portal:** …/quote.html
- **Release:** v1.0.0 (tagged `v1.0.0`), branch `main`.
- Git identity: `detronics-apps` / shop.detronics@gmail.com. Credential helper is
  Windows GCM. **`gh` CLI is NOT installed** in the Code sessions — repo creation
  was done via GitHub Desktop; pushes work via GCM.
- `.nojekyll` is present (required so Pages serves files/paths as-is).

## Architecture & conventions
- **Pure ES modules, no bundler.** `index.html` loads `js/main.js` (`type=module`)
  which imports ~50 modules by relative path. Everything under `js/` is **pure**
  except `js/state.js` and `js/main.js` — only those two touch the DOM /
  localStorage. Keep it that way; it's what makes the logic testable.
- **Tests:** `npm test` runs `node --test tests/*.test.js`. **381 tests, all
  passing** as of v1.0.0. There's a `tests/contract.test.js` that fails if any
  CSS class written via `class:` has no rule, and if any control is handed a
  `tone`/variant the stylesheet doesn't honour — so new UI needs matching CSS.
- **Settings migration is the one door in:** `migrateSettings()` in
  `js/settings.js` upgrades any stored/older settings to the current shape
  (defaults fill gaps; arrays replace wholesale; shipped catalogue entries are
  "topped up" by id unless tombstoned). Every new settings field must default
  here or old data breaks. Same idea for `migrateProject()` in `js/projects.js`.
- **Per-origin data.** `localStorage` and the File-System-Access sync handle are
  tied to the URL origin. Moving from `localhost` to the Pages URL is a NEW
  origin → data does NOT follow. This is why "same address = data persists" is
  the whole backup story.

## Run / test / deploy
```bash
npm test                      # 381 tests, node --test
python -m http.server 8080    # then open http://localhost:8080 (no build step)
```
Deploy = push to `main`; GitHub Pages serves `main`/root. **Pages is
case-sensitive** (Linux) while Windows/localhost is not — a mis-cased import
(`./Money.js` vs `money.js`) works locally but blanks the live site. If the live
site is blank, that's the first thing to check.

## Data & sync model
- **Save all / Open** (top bar): `exportAll()` writes a complete backup
  (settings + projects _with their quotes & invoices_ + customers + inventory);
  **Open** imports **projects/customers only** (merge) and deliberately leaves
  your settings alone.
- **Settings → Backup & restore:** `restoreFromFile()` restores an ENTIRE
  workshop wholesale (via `applyWorkshop`), through the migrations — the way a new
  app version reloads an old backup. Confirms before overwriting existing data.
- **Settings → Team sync:** `js/ui/sync.js`. File System Access API +
  IndexedDB-persisted handle. Points the app at a `workshop.json` in a
  Google-Drive-for-Desktop folder (set the folder "Available offline"). Auto-saves
  on change; conflict-safe (reads before overwrite; raises a "load theirs / keep
  mine" banner rather than clobbering). **Chrome/Edge desktop only.**
- **Client request round-trip:** the portal returns a `{kind:'project', project,
  customer}` payload, either as a downloaded `.json` (import via **Open**) or a
  one-tap request **link** (URL fragment — click it, `applyShared` auto-imports).
  STL files do NOT ride back in the link (fragment is a ~KB summary); large models
  are sent separately.

## Feature map (major areas → key files)
- Pricing engine: `js/engine.js` (rule of thirds + growth split; per-line
  production → CTC → three "tanks" → price).
- Machine economics: `js/printers.js` (`machineHourCost`, `paybackHours` vs
  `lifetimeHours`, colour modes, `slotLimit`).
- Labour: `js/labour.js` (`labourCost`, `resolveLabourRate` — direct or from a
  monthly salary × billable%). Scopes gate per-part work.
- Post-processing: `js/postprocessing.js` (resin by top area + curing, NFC
  coding, after-print hardware assembly).
- Colour by height: `js/colourplan.js` (Z-height bands → auto/loaded colours vs
  manual pause-swaps → schedule + `needsAttendance`) and `js/colourplates.js`
  (`splitByColour` across the bed).
- Scheduler: `js/scheduler.js` (list scheduling, overnight/HIRA priority,
  attended-only jobs kept off the night).
- Bed packing / geometry: `js/bedpacking.js`, `js/geometry.js`.
- Model parsing: `js/mesh.js` (binary/ASCII STL, OBJ, 3MF → bbox, volume, area).
- Documents: `js/documents.js` (quotes/invoices snapshot the assumptions;
  `lockedPricing` freezes an invoiced project's figures).
- Inventory: `js/inventory.js` (stock folded from a movement log); spool labels
  in `js/ui/export.js` (`buildSpoolLabels`).
- Portal: `js/ui/portal.js`, `js/portal-request.js`, `js/portal-config.js`.
- UI tools: `js/ui/tools/*` (estimate, projects, catalogues, inventory,
  documents, dashboard, scheduler, settings, guide).

## What changed most recently (this session)
1. **Hardware stages** — hardware is `stage:'during'` (embedded mid-print:
   magnets/nuts/NFC) or `'after'` (heat-set insert, screw, USB light). After-print
   parts ship **loose** (added to box weight) unless the post-processing "fit"
   toggle assembles them. See `hardwareCost` in `js/packaging.js`.
2. **Post-processing dropdown** — collapsible per-part section (estimator):
   support removal, resin, deburring, NFC coding, "fit «after-print component»".
   Empty = raw part off the printer. `postProcessingSubsection` in
   `js/ui/tools/estimate.js`.
3. **Deburring is now opt-in** — the `cleaning` labour op moved from `unit` scope
   to a new `deburrUnit` scope (part flag `needsDeburring`); a migration flips
   stored `cleaning` ops. Plain parts got cheaper by default (intended).
4. **Colour by Z-height + pause-swaps** — `js/colourplan.js` + engine fold (swap
   labour into `direct`, `line.needsAttendance`, `line.swapWaitMinutes`);
   settings `colour.swapLabourMinutes/swapWaitMinutes`; band editor +
   swap-schedule display in the estimator's "Multi-colour (by height)" panel.
5. **Scheduler attended-only** — jobs with manual swaps carry `needsAttendance`;
   with overnight priority on, they're kept off the overnight slots and flagged.
6. **Salary-based labour rate** and **printer payback-hours** (see labour/printers).
7. **Savings-chart top-label clipping fixed** (`js/ui/svg/savings.js`, `top`
   padding).
8. **Renamed** "3D Printing Bench" → **"3DPrintCost Bench"**, bumped to
   **v1.0.0**, initialised git, published to GitHub + Pages.

Already existed (earlier sessions), verified present: Delete + tombstones
(`settings.removed`, `deleteEntry` in catalogues), hardware **part numbers**
(logistics reference, shown in Inventory), **spool labels**, **STL parsing**,
1-part-vs-full-plate **savings chart**, backup/restore, request link.

## Pending / deferred / caveats (good next-chat candidates)
- **Swap wait-time in the estimate lead figure.** Manual-swap labour and the
  attended/overnight rule are fully in price + scheduler. The swap *wait* extends
  the job on the **Schedule tab** (via `jobFromProject` machine-hours) but the
  estimate's own quick "lead time" is still printing-only (kept out of the
  engine's machine-minutes to avoid charging machine cost for idle pause). Offered
  to fold it in — not done.
- **Colour-band editor in the client portal** — bands + post-processing are in the
  internal estimator only; the portal doesn't yet expose colour-by-height or the
  after-print "fit" choice. Offered — not done.
- **STL round-trip with the estimate** — parsing works; embedding models into the
  returned request/file (with a size cap) is not built. Links can never carry them.
- **Persona re-frame** the user gave for Simple/Advanced/Expert (Simple = "saw it
  on TikTok", Advanced = has custom settings, Expert = teaching how/why) — applied
  in spirit; double-check hardware is reachable in the portal's Simple view.
- **Google Drive raw OAuth API** (for phone support of team sync) — explicitly
  deferred; the Drive-folder file route is the chosen approach (desktop only).
- **Email status-updates** to customers — parked from early on.

## Gotchas (will save you time)
- **ES-module cache in the in-app browser:** edits won't show on reload. Force it
  with `fetch(url,{cache:'reload'})` over all `.js`/`.css` then `location.reload()`
  — or the app's own "Reload the app" link (bottom-right) / `forceRefresh` in
  `js/main.js`. Plain reload / Ctrl+Shift+R often isn't enough here.
- **NEVER clear/removeItem the app's `localStorage`** during verification — it
  wiped real workshop data once and there is no undo. To test a link/hash path,
  use a fresh tab with the hash, not a data reset.
- **`python3` silently no-ops** in the Git-Bash shell here; use `python`.
- **Every new user-facing feature must be written up in the How-to-use guide**
  (`js/ui/tools/guide.js`, the "Settings worth knowing" / features sections). This
  is a standing user rule.
- **`gh` is not installed**; use GitHub Desktop or GCM-authed `git push`.

## First things a next session should do
1. `npm test` — expect 381 passing. If fewer, something regressed.
2. If verifying in the browser, start the dev server and remember the
   force-refresh dance above.
3. Read `MEMORY.md` in the memory dir for the running project context.
