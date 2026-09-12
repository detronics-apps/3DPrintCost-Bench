# Implemented

Every small request that has shipped, newest first, with why it was done and
**how** — enough that the same thing could be reproduced in another Detronics app
without re-deriving it. The granular ledger; the grouped, user-facing write-up of
each cluster lives in `FEATURES.md`. See the `detronics-app` skill's
`references/backlog.md` for the pipeline (`BACKLOG.md` → here / `REJECTED.md`).

_This ledger begins 2026-09-08. Features that shipped before then are recorded in
`FEATURES.md` and the git history._

## Coffee icon: saucer + steam lines added (v1.0.58)

Extended the side-view cup (`js/main.js`) with a saucer beneath (`M4 19.5 Q 11 21.8 18 19.5`) and
two steam lines rising from the rim — same `currentColor` line style, still palette-only. Skill
`brand.md` reference paths updated. Verified in-browser: 5 paths, navy stroke.

## Coffee icon: palette-only side-view cup, not the emoji (v1.0.57)

The `☕` emoji renders in its own multicolour glyph, off-palette. Replaced it with an inline SVG
line-drawing of a side-view cup (`js/main.js`, via the `svg()` helper): `fill="none"
stroke="currentColor"` so it inherits the button's text colour (`--text`, a palette token) and
follows the theme like the theme glyph. Body `M6 7 H16 V14 A5 5 0 0 1 6 14 Z` + handle. Verified:
stroke resolves to `#1f2d3d` (navy), no emoji in the DOM. Skill `brand.md` updated to make
palette/`currentColor`-only icons (no multicolour emoji) the rule.

## Brand chrome: logo links to the site, Buy Me a Coffee button + footer link (v1.0.56)

`js/main.js` header/footer, `css/layout.css`, `css/components.css`. Also written into the
`detronics-app` skill (`references/brand.md` + the reuse checklist) as a standard for every app.

- **Logo → website** — the brand logo is wrapped in an anchor to `https://www.detronics.co.za/`
  (new tab, `rel="noopener noreferrer"`), class `.brand__home` so it does not inherit link styling.
- **Buy Me a Coffee button** — a round `btn btn-icon` anchor with a `☕` glyph, placed immediately
  left of the theme toggle in the header, linking to `https://buymeacoffee.com/detronics` (new tab).
  A real `aria-label` since the glyph is decorative.
- **Footer link** — a `.linkish` "Buy me a coffee" anchor beside the version number, same URL.
- `.btn` now sets `text-decoration: none` — the coffee button is an `<a>`, which otherwise
  underlines the glyph. Anchors (not JS `window.open`) so the links are real: middle-click, copy,
  open-in-new-tab all work. Verified in-browser: logo href, order `[…, donate, theme, …]`, round
  (border-radius 50%), no underline, footer link present.

## Portal: compile-email downloads + attach checklist, big-file nudge, link button removed (v1.0.55)

The client form's send step (`js/ui/portal.js`), three requests shipped together.

- **Compile the email** (was "Open in your email"): now downloads `quote-request.json` first, THEN opens the
  mailto — so the file is in Downloads ready to attach (mailto can't attach). Made the leftmost, primary
  (dark-blue) button; verified in-browser: order `[Compile, Download]`, class `btn btn-primary`, bg
  rgb(47,110,148). "Copy a request link" button removed (the link still rides in the email body for one-tap
  import). When no company email is set, Download falls back to primary.
- **Attach checklist** — a "Please send us:" list in the send step (request .json, model file(s), proof of
  payment when expedited), mirrored as a "Please attach:" block in the email body (`requestText`).
- **Big files** — `loadModel` records `file.size`; a model over ~20 MB shows a warn banner to send it via a
  transfer link (WeTransfer/Drive/Dropbox) or zip it, since it will bounce from email. (Backlog asked for
  options first: option A shipped; B = zip-for-them and C = server/upload deferred — B needs a lib + holding
  raw bytes, C contradicts the no-server design.)
- How-to: new FAQ "How does a client actually send us their request?".

## Dashboard: imported history + internal prints count toward CTC, hours and filament (v1.0.54)

Two dashboard bugs (`js/analytics.js` `dashboard()`, `js/ui/tools/dashboard.js`).

- **Machine hours / Filament used ignored imported history** — those tiles summed only the app's own
  attempts; the ROI view already read `priorRuns` but the top tiles did not. `dashboard()` now takes
  `priorRuns`, and the dashboard tool passes `state.priorRuns`. `machineHours` and `kgUsed` add the
  prior runs' minutes/grams (range-filtered on `run.at`), with a tile hint "incl. N h / N kg imported".
- **Cost to Company read zero** — it summed only invoiced CTC, so a workshop of company-internal
  projects (no invoice) plus imported history showed 0. Now `costToCompany = invoiced CTC +
  internalExpense (company-internal production, already subtracted from profit) + priorCtc`. New
  `priorRunCost(run, settings)` estimates a run's CTC = machine time × the printer's hourly rate +
  filament (per-head material when the run names it, else the catalogue's average per gram). Prior runs
  earned no revenue, so they raise CTC but NOT current profit (profit is unchanged). Tile hint shows the
  internal + imported split. Tests in `tests/records.test.js` cover `priorRunCost`, the three totals, and
  that profit is untouched.

## Portal: collect drops packaging too, and expedite loses the quote caveat (v1.0.53)

Two portal-facing bugs (`js/ui/portal.js`).

- **Collect still charged packaging** — the portal note promises collect = "no packaging, parts as
  they come off the printer", but `price()` only passed `shippingMethodId: 'collect'` (which the engine
  zeroes the courier for, `js/engine.js:795`) and never `noPackaging`, so packaging (the R19.70) was
  still charged — the price contradicting the promise. Fix: `price()` and the request payload now pass
  `noPackaging: state.shippingMethodId === 'collect'`, so both the courier and the packaging are zero on
  collect and the imported project matches the quote. Regression test in `tests/portal.test.js` (collect
  → both extras 0; a couriered order still boxed); it fails without the flag.
- **Expedite showed the "usually at or below" caveat** — an expedited client pays the estimate up front,
  so the quote is the price and will not come in cheaper. Added `isExpedited` (expedite-only, or optional
  + ticked) and dropped the last sentence of the quote-caveat banner when it is set. The estimate-nature
  wording stays; the expedite panel already explains the estimate is set at or above the final cost.

## Estimate → project carries the printer + heads, and opens the part editor (v1.0.52)

Two bugs on the estimate save-as-project transition (`js/ui/tools/estimate.js`, "Save this bed as a project").

- **Heads/printer lost on save** — the editor reads the bed's printer and loaded spools from the
  PROJECT-level `project.printerId`/`project.slots` (`js/ui/tools/projects.js:604,773,784`; a part only
  overrides with `printerOverride`). The handler set those per part but never on the project, so
  `makeProject` kept its defaults (`bambu-x1e`, `slots:null`) and a 3-head bed opened as one default
  head — the "yellow/white/brown became one PETG black" report. Fix: pass `printerId: state.quick.printerId`
  and `slots: state.quick.slots` into the `makeProject({...})` call. The per-part `mix` slotIds already
  match those slots, so the colour split survives. Verified with a data-layer check: a project built the
  new way yields `orderFromProject().plate.slots.length === 3`; the old way yields `null`.
- **POD section missing until reselect** — the handler set `state.activeProjectId` but not
  `state.activePartId`, so the project opened showing only Printer/Project/Orders until the operator
  clicked a part. Fix: `state.activePartId = project.parts[0]?.id || null` on the transition — the same
  pattern the request-import path already uses (`js/ui/tools/projects.js:157`).

_Upload-project path: files saved AFTER this fix carry heads correctly (they now hold project-level
slots that `migrateProject` preserves and round-trips). Files saved by the OLD buggy handler still hold
the heads only on `parts[0]`, and `migrateProject`'s recovery net (`js/projects.js:628`) only fires when
`printerId == null` — a pre-fix file has the non-null default, so it won't auto-recover. Left as-is
(pre-existing data, not worth speculative recovery); can add a targeted recover if any such file matters._

## Project money bars flow like the estimate + estimate-vs-actual (v1.0.51)

- **Flow fix** (`js/ui/tools/projects.js` `bedLayoutPanel`/money diagram): the project's `moneyDiagram`
  rows now mirror the estimate's (`js/ui/tools/estimate.js`) exactly — Production = material, machine,
  electricity, (labour only when `labourInCtc`), hardware, other, rejection, general; Part price =
  cost recovery, labour, growth, profit; Invoice = parts, packaging, shipping, handling, storage,
  other, tax. Because `price.recovery` == the Production total and `parts.total` == the Part-price
  total, each bar's first block equals the previous bar's total (verified live: 91.16 → cost
  recovery 91.16 → 664.74 → parts 664.74). The old rows dumped labour into Production and mislabelled
  commercial, breaking the flow.
- **Estimated vs actual**: re-prices the project with every part's `slicer` nulled (`priceProject`
  on a shallow clone) to get the geometry-estimate invoice, compares to the sliced actual
  (`result.totals.finalInvoice`), and shows an "Estimated vs actual" panel (three stat tiles +
  a note) whenever any part is fully sliced and the two differ. The under-estimate gap is framed as
  a coupon the customer could be given. Verified: estimate R1223.46 vs actual R850.94 → R372.53 under.
  Groundwork for later coupon logging.

## Bed picture: no overflow, purge tower shown (v1.0.50)

Follows v1.0.49, which aligned the numbers but drew a second grid that could still spill and mis-place the tower. Root cause: three different tower models (packBed area-fraction, partsPerPlate lost-cell, arrangeBed full-strip) and my v1.0.49 grid drew the engine's `perPlate` over a strip-reduced area → the bottom row overflowed.

- **`js/bedplan.js` single-type branch now delegates to `plateLayout`** (geometry) — the SAME grid `partsPerPlate` counts, with positions + tower placement. Converts plateLayout's build-absolute coords to the view's margin-relative space (`pos.x - margin`). `perPlate` (override) is capped at the real `capacity` so it can never overflow; count/positions come from the fit itself. A single type also drives this whether or not `perPlate` is passed (portal/estimate benefit too).
- **`js/ui/tools/projects.js`**: the tower is now decided from the PARTS' colours (any shared part multi-colour, or the bed's parts span 2+ materials), matching the engine's rule — not just `project.slots`. So a two-colour job draws the tower even when the loaded spools don't show two.
- Single-type beds have no `bedPlacement` in the engine (only computed for `rawLines.length > 1`), so the engine's per-plate is already `partsPerPlate(reservedArea)` — identical to `plateLayout`, hence exact alignment.
- Test updated: the tower-clearance test now asserts no placement overlaps the reported tower rect wherever it sits (plateLayout puts it bottom-right / beside, not a back strip). Verified: picture perPlate == estimate perPlate, overflowX/Y false, tower drawn and −1 count, across beds with and without a tower.

## Plate counts align everywhere; no-cache dev server (v1.0.49)

- **Bed picture matches the estimate's per-plate.** Root cause: `partsPerPlate`/`bestGrid`
  (estimate) tries both XY orientations and grids cleanly; `arrangeBed` (the drawn layout) used one
  orientation and a guillotine that fragments — so it drew fewer per plate (e.g. bed 300×220: grid
  15, layout 12). Fixes in `js/bedplan.js`: (1) the guillotine now tries both orientations per unit
  (`placeOn`), and (2) a **single part type** short-circuits to a clean grid of exactly `it.perPlate`
  per plate (better-orientation cols), so the picture equals the estimate and honours the operator's
  override. `js/ui/tools/projects.js` `bedLayoutPanel` passes each part's `perPlate` = `result.lines
  [idx].perPlate` (override-or-grid) into `bedPlan`; `bedPlan` already forwards item fields to
  `arrangeBed`. Verified: 300×220 → both 15 (7 plates); override 12 → 12/plate (9 plates).
- **No-cache dev server** (`serve.py`): `SimpleHTTPRequestHandler` subclass sending
  `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` + `Pragma`/`Expires` on every
  response, threaded, port arg. `package.json` `serve` → `python serve.py 8080`; `.claude/launch.json`
  preview → `python serve.py 8847`. Fixes the recurring stale-ES-module problem (the browser was
  running old modules after each update, so fixes appeared not to work / the app half-broke). No
  build step, consistent with the no-build architecture.

## Completing production records the whole job (v1.0.48)

- `js/ui/tools/projects.js`: extracted `bookAttempt(project, part, line, attempt)` (recordAttempt +
  logEvent + filament/part/resin movements) and `slicerTotals(part, line)` (whole-print grams =
  max of `slicer.grams` and the head sum; minutes = `slicer.minutes`; estimate×qty fallback).
  `recordOnePrint` now builds a per-plate attempt (share = `onPlate/quantity`) and calls
  `bookAttempt` — unchanged behaviour for the manual button. New `recordCompletion(project, part,
  line)`: `remaining = quantity − partStats.accepted`; if ≤0 records nothing, else books one
  attempt of `remaining` accepted, `slicerTotals.minutes − prior.actualMinutes` and
  `slicerTotals.grams − prior.actualGrams` — so the recorded prints always SUM to the whole sliced
  job. The `inspection-pass` handler now calls `recordCompletion` for every part (topping up, not
  only auto-recording parts with none). Verified live (fresh port): a 100-part / 27.5 h / 1.59 kg
  job with no prior logs one 100 / 1650 min / 1590 g entry; with a prior 12-part plate it adds
  88 / 1452 min / 1399.2 g so the totals are 100 / 1650 / 1590. Per-plate accuracy on the manual
  button comes from the existing `partsPerPlateOverride` ("Parts per plate", part Advanced), which
  `engine` already honours in `line.perPlate`.

## To-scale timeline, longer-print-first at night, sliced figures on record, chart scale (v1.0.47)

- **Record uses slicer figures** (`js/ui/tools/projects.js` `recordOnePrint`): actual `minutes`/
  `grams` come from `part.slicer` (total minutes; grams = max of `slicer.grams` and the sum of
  head grams), scaled by `onPlate/quantity`; the estimate is only a fallback and stays on
  `estimatedMinutes`/`estimatedGrams`. `movementsForRun` already draws from `attempt.grams`, so
  the stock draw is corrected too. Fixes: a 27.5 h / 1.23 kg print was logging the ~248 min /
  245.7 g estimate.
- **Night ordering + placement** (`js/scheduler.js`): the evening/day-off branch of
  `orderForClock` now sorts unattended prints longest-first by `!needsAttendance` (independent of
  the overnight-HIRA toggle, which only governs whether a job may START outside hours). In
  `liveSchedule`, only the machine's FIRST job may begin now (running, or startable this minute);
  a later job — even one marked `in-production` — is placed like any queued job (`nextAttendedStart`
  or `nextWorkingStart`), so a second "in production" print waits for working hours. +1 test.
- **To-scale weekly timeline** (`js/ui/tools/scheduler.js` `weekTimeline`): replaces the day-column
  `gantt`. Maps `startAt`/`endAt` onto a time axis from `now` across ≥7 days (viewBox 1200-wide,
  `xAt(ms)`), shades each working window green, draws midnight gridlines + day labels + a "now"
  line, and numbers each bar. Wrapped in a `.panel` ("The week ahead"). CSS: `.timeline-scroll`
  (overflow-x auto) + `.week-timeline` (width 100%, min-width 720px → desktop fills, phone scrolls).
- **Chart scale** (`js/ui/tools/dashboard.js` `sparkline`): a top dashed gridline labelled with the
  max value and a solid zero baseline, y-axis value labels, and each bar's own value above it;
  `format` (full money) + `compact` (`compactMoney`: R12k / R1.2k / R850) options, wired from the
  trend panel.

## Scheduler: start prints in working hours, numbered timeline (v1.0.46)

- **Starts only in working hours** (`js/scheduler.js`): new `nextWorkingStart(from, week)` returns
  `from` if it is inside a working window, else the next window opening. In `liveSchedule`'s
  placement loop, a `firstOnMachine` flag lets ONLY the first job per printer begin at `clock`
  (= now, the operator is present); every later unattended job uses `nextWorkingStart(clock)`, so a
  machine that frees at 02:00 has its next job wait for 08:00. Attended jobs still use
  `nextAttendedStart`; in-production still starts at now. +1 test (evening → long runs to 04:00,
  next waits Thu 08:00).
- **Numbered Gantt** (`js/ui/tools/scheduler.js`): `main` builds `numberOf` (job id → 1..N in
  start-time order, the same order as the table); `gantt(result, numberOf)` draws `#N` centered on
  each bar instead of the (overlapping) truncated name; the "Start times" table gained a leading
  `#` column and shares `sortedPlaced`/`numberOf`.

## No production without the real slicer figures (v1.0.45)

- **Domain** (`js/workflow.js`): `partHasSlicerGrams` (flat total or any head > 0),
  `partHasSlicerTime` (minutes > 0), `partFullySliced` (both), `unslicedParts(project)`, and
  `SLICE_GATED_ACTIONS = {send-quote, payment-received, start-production, inspection-pass}` — the
  moments an order moves toward/into production, covering the quote path, the expedited path
  (payment-received) and a company-internal print (production actions, no quote/payment). The old
  loose `partSliced` is gone; `facts.sliced` now uses `partFullySliced`, so the Quotation progress
  tick and the gate agree. +4 tests.
- **Gate** (`js/ui/tools/projects.js` `run`): if a gated action is pressed with parts unsliced,
  it does NOT advance — sets `state.ui.requireSlice`, makes the first offending part active,
  rerenders, toasts why, and scrolls to `[data-slice-part=<id>]`.
- **Feedback** (`slicerFigures`): when `state.ui.requireSlice` and the part is not fully sliced,
  a red `banner('danger', …)` names what is missing, and the empty grams / hours / minutes fields
  render with `input--error` (red). The subsection is wrapped in a `[data-slice-part]` anchor for
  the scroll. `numberField` gained an `invalid` option (`js/ui/controls.js`); `.input--error` CSS.
  A standing amber `banner` in the Workflow panel lists how many parts still need figures while
  the order is at/before production.

## Event-history times, h:m slicer time, trend toggle, document filters (v1.0.44)

Same workshop session; corrections and follow-ups.

- **Removed “Where the time goes”** (the phase-time analytics from v1.0.42) — a misread of the
  user's request. Deleted `js/phasetime.js` + `tests/phasetime.test.js`, the dashboard panel and
  its import, the guide how-to and the backlog note. The v1.0.42 profit-trend sparkline stayed
  (then reworked into the toggle below).
- **Event history date+time**: `js/ui/tools/projects.js` `fmtEventTime(at)` →
  `toLocaleString` with month/day/year + hour/minute; `eventTimeline` uses it; a **Copy event
  history** button (`copyText`, chronological) copies the timestamped list for a client email.
- **Slicer print time as h + m**: both `js/ui/tools/projects.js` `slicerFigures` and
  `js/ui/tools/estimate.js` slicer body now render two fields (hours, minutes) that read/write
  the single stored `slicer.minutes` total (`Math.floor(total/60)` / `total % 60`; `setTime(h,m)`
  → `h*60+m`). No engine change — the stored figure is unchanged.
- **Full-width trend toggle**: `js/ui/tools/dashboard.js` replaced the two side-by-side
  sparklines with one panel — a header with Revenue/Profit `button`s (primary = active,
  `state.ui.trendMetric`) and a single full-width `sparkline` (1040×150). Removed `.trend-grid`
  CSS.
- **Document filters**: `js/ui/tools/documents.js` `documentList` gained a `.filter-bar` —
  `state.ui.docFilter { kind, customer, from, to }`; kind (all/quote/invoice) and customer
  selects (customers present in the docs), and two `type: 'date'` `textField`s for a date
  range on `document.issuedAt`; a Clear button and a “Shown X of Y” tile appear when a filter
  is on. `textField` gained a `type` option (`js/ui/controls.js`); `.filter-bar` CSS.

## Per-day working hours, click-to-select catalogues, auto-record on completion (v1.0.43)

Follow-up from the same workshop test session.

- **Per-day working hours**: `settings.scheduler.week` — 7 days indexed by `getDay()`, each
  `{ working, start, end }`; default Mon–Fri 08–16, weekend off (`js/settings.js`, with a
  migration that builds `week` from the old `dayStartHour`/`endOfDayHour` — weekdays working,
  weekend off — and normalises a partial stored week). Scheduler refactor: `js/scheduler.js`
  `resolveWeek`/`dayWindow`/`inAttendedWindow(date, week)`/`nextAttendedStart(from, hours,
  week)` (skips non-working days) and `orderForClock` now key off the day's window;
  `liveSchedule` takes `week` (falls back to a uniform week built from `dayStartHour`/
  `endOfDayHour`, so the earlier tests still hold). On a non-working day the evening/overnight
  branch runs, so the longest unattended print is offered now and short attended jobs wait for
  the next working day — the Saturday bug the user hit. UI: `js/ui/tools/scheduler.js` renders
  7 per-day rows (working toggle + From/To) via `workWeek`/`ensureWeek`, passes `week` to
  `liveSchedule`, and the "What to start now" header shows today's hours or "… is a day off".
  +3 tests. Verified live via fresh dynamic import: Sat afternoon → recommends the 12.5 h now.
- **Click-to-select catalogue rows**: `table(columns, rows, options)` gained `onRowClick`,
  `isSelected` and `rowClass` (`js/ui/controls.js`) — a row click selects unless it lands on a
  real control (`closest('button,input,a,select,label,textarea')`). Every catalogue browse
  table (printers, materials, shipping/packaging/hardware via `listEditor`, customers) now
  passes these; the per-editor "…-pick" dropdowns are removed; archived rows are shown dimmed
  and sorted to the foot (`.is-archived`) so they stay reachable to restore. CSS `.is-clickable`
  /`.is-selected`/`.is-archived` (`css/components.css`). Verified live via dynamic import.
- **Auto-record on complete production**: extracted `recordOnePrint(project, part, line)` in
  `js/ui/tools/projects.js` (the manual button now calls it); the `inspection-pass` action
  auto-records one plate for every part with zero attempts (from the estimate, booking stock),
  then advances — so completing production books hours+stock without a second step and never
  double-counts a part already recorded. Records ONE plate (same figures as the manual button)
  so it never over-states the hours the ROI reads. Why: the user completed a print and it did
  not record.
- **ROI wording**: `js/ui/tools/dashboard.js` — columns renamed "Hours run / life" and "Still
  to pay off" (pill "≈ N more print-hours" / "paid off · +X beyond"), with an explanatory line.

## Import printer, working deletes, live schedule, paid-flows, time-per-stage (v1.0.42)

A batch from a workshop test session; each item independent.

- **Delivery step turns green (client form)**: `stepHead(n, title, info, done)` gained a
  `done` param — renders `✓` on a `.stephead__num--done` (background `var(--ok)`) badge; each
  call passes its `steps[i].done`. `step-delivery` done is now `!!state.shippingMethodId`, so
  selecting any fitting delivery type (blank placeholder option added) turns badge ③ and the
  top strip green. Verified live: 4 badges render, done ones show green ✓ (`js/ui/portal.js`,
  `css/components.css`).
- **Imported request carries the printer**: `portalRequest` set `printerId` on each part but
  the bed printer is a **project-level** field (`makeProject` defaults `'bambu-x1e'`), so the
  import opened on the default machine — recorded hours then landed on the wrong printer
  (Snapmaker read 0 on the Dashboard/ROI). Fix: `portalRequest` now sets project-level
  `printerId` and `slots` from the chosen machine (`js/portal-request.js`). Existing imports
  keep their wrong printer — re-import or set the project printer to correct historical ones.
- **In-app confirm dialog (deletes work in a sandbox)**: `window.confirm` is silently ignored
  in an embedded/sandboxed webview (returns false), so every Delete and the reset/restore/
  open-company guards did nothing. Added `confirmModal(message, { confirmLabel, cancelLabel,
  danger, title })` → `Promise<boolean>` in `js/ui/dom.js` (`.modal-overlay`/`.modal-card`
  CSS), and converted all 12 `window.confirm` call sites to `await confirmModal(...)` with the
  enclosing handler made `async` (`main.js`, `documents.js`, `projects.js`, `catalogues.js`,
  `inventory.js`, `settings.js`). Verified live: modal shows, Cancel keeps the item.
- **Save-as-project clears the estimator**: after `replaceProject`, `state.quick` is reset to
  `defaultQuick()` keeping only `printerId`/`materialId`/`slots` (the machine setup), so the
  next estimate starts blank (`js/ui/tools/estimate.js`).
- **Live, clock-aware schedule**: new `liveSchedule(jobs, printers, { now, dayStartHour,
  endOfDayHour, overnightAllowed })` in `js/scheduler.js` advances a real per-printer clock
  from `now` → distinct `startAt`/`endAt` per job, attended jobs kept inside the workday
  window, unattended jobs may take the night when `overnightAllowed`; `orderForClock` makes
  the queue clock-aware (evening → longest unattended first for the night; daytime → prints
  that finish by end-of-day first, shortest first). Returns per-printer `recommendations`
  ("What to start now"). Settings gained `scheduler.dayStartHour`/`endOfDayHour` (default
  8/16, migration-backfilled). UI: `js/ui/tools/scheduler.js` shows a "What to start now"
  panel (`.startnow`), workday fields, and live clock times in the table. `schedule` (day
  model) is untouched so the 501 existing tests still hold; 7 new `liveSchedule` tests.
- **Paid status flows to the project**: `documents.js` gained a `paid` quote status; in the
  documents tool, `persistStatus(project, doc, newStatus)` writes the doc status and, when
  set to `paid` and the project's `displayPhase` is `quotation`/`awaiting-payment` and
  `paymentReceivedAt` is unset, calls `advance(project, 'payment-received')` (→ Production),
  in one `replaceProject` (`js/ui/tools/documents.js`).
- **"Where the time goes" + profit trend (Dashboard)**: new pure `js/phasetime.js` —
  `orderPhaseTimes(project, now)` reconstructs time-in-phase from the history's
  `phaseFrom`/`phaseTo` transitions (open phase runs to now; closed/cancelled stop the
  clock), `phaseTimeSummary(projects)` averages across orders, slowest first; `fmtSpan`.
  Dashboard renders it as a bar table + a slowest-stage banner, and a profit-by-month
  sparkline beside revenue (`revenueByMonth` buckets already carry `cost`). 5 new tests.
- **Guide**: added how-tos — plan-what-to-print-next, mark-paid, see-where-time-goes, and the
  backlog "catch up when prints went un-logged" (`js/ui/tools/guide.js`). Why: memory rule
  [[explain-features-in-guide]].

## Client form: pickup default, banking on expedite (v1.0.41)

- **Pickup default**: `state.shippingMethodId` defaults to `'collect'` (state def + config
  load); the delivery `selectField` lists collect first then named couriers, and the
  `{ value: 'auto', label: 'Cheapest that fits' }` option is removed (`js/ui/portal.js`).
- **Banking on expedite**: `portalConfig` now carries `company.bankingDetails`
  (`js/portal-config.js`); the expedite panel shows a "Where to pay" block with the
  banking details (`.banking`, `white-space: pre-line`) whenever expedite is on
  (ticked or 'only' mode), else a note that details will be sent. Verified live: default
  = collect, no "Cheapest that fits", ticking expedite reveals the banking block. Why:
  user requests. See [[client-form-minimal]].

## Client form: bed picture collapsed by default (v1.0.40)

- `js/ui/portal.js`: the bed layout panel wraps `bedNode` in
  `section('portal-bed', 'See how your parts sit on the printer bed', […], { open: false })`,
  so it's collapsed by default; `bedPlan` is called with `title: ''` to avoid a duplicate
  heading inside the fold. Guiding principle (from the user): the client form shows only
  what's needed to order and never overwhelms — the bed picture is optional detail.

## Remove-model button on the client form (v1.0.39)

- `js/ui/portal.js` `partPanel`: a red `button('Remove model', …, { danger: true })`
  (clears `part.geometry` + `part.modelName`) shows when a model is loaded — previously
  the client could only replace a model, not remove it. `js/ui/tools/estimate.js`
  "Clear the model" gained `danger: true` so it's red to match. Why: user asked where
  the (red) remove-model button was.

## Free delivery: remaining-to-threshold message (v1.0.38)

- `js/ui/portal.js` price panel: when not yet free and a threshold is set, show a
  `banner('info', 'Only add {threshold − measured} more to your parts to get free
  delivery.')` (using `result.shipping.freeRule.threshold`/`measured`) instead of
  stating the bare threshold. Verified live ("Only add R681.02 more…"). Why: user
  wants the outstanding amount, in a notification block.

## Print-intent: collapsible radar, self-contained blurbs, Display default (v1.0.37)

- **Collapsible radar** (`js/ui/portal.js`): the per-part score radar is wrapped in a
  `section('portal-radar-<id>', 'See how it scores', […], { open: false })`, collapsed
  by default; the blurb stays visible above it.
- **Display Only default**: `defaultProfileId(config)` prefers `'display'` (the most
  common request) when the shop offers it, used at portal init and add-a-part.
- **Self-contained blurbs** (`js/profiles.js`): reworded Extra Strong / Strength /
  Function / Display Only so each describes only its own purpose + settings, with no
  cross-references to other intents (a shop may hide some). `migrateSettings`
  (`js/settings.js`) refreshes built-in profiles' `blurb` from `DEFAULT_PROFILES` (the
  blurb is display-only, so no user edits are lost), so existing installs get the new
  wording. Why: user — radar should fold away, blurbs shouldn't mention unshown intents,
  Display Only is the common default. Verified live: default = Display Only, radar
  collapsed; blurb rewording confirmed in code (shows after a full module reload).

## Client form: load-first colours, machine inferred (v1.0.36)

- **Step 1 inverted** (`js/ui/portal.js`): removed the print-type chips. The customer
  loads heads directly (Head 1 + "Load another head"); the type is INFERRED — distinct
  material TYPES > 1 → multimaterial, else > 1 slot → multicolour, else single (compares
  `material.type`, not the spool id, so different colours of one plastic = multicolour).
  Derivation runs at the top of `render()` before `price()`; `state.printerId` is set to
  the cheapest/default machine that supports the load (a manual pick is kept if it still
  fits). The colours UI uses the most-capable machine so loading isn't blocked
  (`capablePrinter`), with `filamentSlots({ showMode: false })` hiding the machine's own
  mode line in favour of a derived plain-language line.
- **Machine filter**: "Choose a specific machine (optional)" lists only
  `shopPrinters.filter(printerSupports(type, count))` — `printerSupports` checks
  colourMode AND `slotLimit >= count`, so a single-colour machine drops out once a
  second colour is loaded. Verified live: 1→One colour, 2 PLA→Several colours, +TPU→
  Several materials; machine options for a 2-colour load = Bambu + Snapmaker (Ender
  excluded). `filamentSlots` gained `showMode`; `slotLimit` imported into portal.
  Why: user — don't ask the type, just load filament and infer; hide machines that
  can't do it.

## Client form: guided stepper + colour-type chooser (v1.0.35)

- **Progress stepper** (`js/ui/portal.js`): a `stepper` strip of 4 steps (Colours /
  Your parts / Delivery / Your details) with `is-done`/`is-current`/`is-todo` states,
  clickable to `scrollIntoView` the matching `id` anchor. Done-states reflect real
  progress (a chosen `printType`, every part with `geometry`, a shipping choice + no
  address error, `valid.ok`) — never pre-ticked by defaults. `valid` and the local-only
  country are hoisted to the top of `render`.
- **`stepHead(n, title, info)`** numbered headings with an `infoIcon` (imported from
  `dom.js`) on each of the 4 sections.
- **Choose by colour type, not machine**: step 1 offers `printType` chips (One colour /
  Several colours / Several materials) built from the company printers' `colourMode`
  (now exposed in `portal-config.js`). Selecting a type auto-picks a supporting printer
  (`printerForType`, prefers the default) and resets slots; the specific machine is a
  collapsed optional `section`. Colours are hidden until a type is chosen.
- **`filamentSlots({ maxSlots })`** caps the loaded colours (single colour → 1)
  regardless of the machine's capacity. Why: user — the client shouldn't pick a printer,
  only the colour/material type; steps shouldn't pre-tick; each step needs an (i). 501
  tests pass; verified live (stepper states, info icons, type chooser derived from
  `colourMode`); the running preview showed only "One colour" from a cached old
  `portal-config.js` — a fresh config yields all three (confirmed by re-import).

## One-part-at-a-time accordion across surfaces (v1.0.34)

- **Portal parts accordion** (`js/ui/portal.js`): `partPanel(ctx, part, i, line, open)`
  now collapses to a `.part-block__head` header (toggle + Remove) when not open,
  mirroring the estimate. The main loop resolves `state.ui.openPart` (null = all
  closed, undefined = first open, stale = first); Add-a-part opens the new one.
- **Project part toggle** (`js/ui/tools/projects.js`): clicking the active part in the
  parts table again sets `activePartId = null`, so the sidebar editor closes and all
  parts can be minimised (one open at a time).
- **`section({ group })`** (`js/ui/controls.js`): opt-in accordion infra — opening a
  section in a group collapses its open siblings (`collapseSiblings`). Dormant until a
  `group` is passed; ready for the stepped-flow "auto-minimise siblings" item. Why:
  user asked to carry the estimate's one-open-at-a-time part behaviour to the client
  form, project, and (future) employee form. 501 tests pass; portal live-verify limited
  by its lack of the app cache-buster (needs a browser hard refresh).

## Tighter packing, mix balancing, fit-intent tidy-ups (v1.0.33)

- **Guillotine bed packer** (`js/bedplan.js`): replaced the shelf packer with a
  free-rectangle guillotine packer (each plate keeps a `free` rect list; place in the
  smallest fitting rect, split into right strip + below strip). Fills the space beside
  a tall part, so 40 small + 1 tall pack in ~3–4 beds instead of 5. Test added
  (`tests/bedplan.test.js`, `plateCount <= 4`, no overlap).
- **Mix first-slot balancer** (`rebalanceMix` in `js/filaments.js`): editing a non-first
  slot sets it and puts the remainder on slot 1, leaving the other slots untouched;
  editing slot 1 keeps the old cascade. Test in `tests/filaments.test.js`.
- **Estimate accordion collapse-all** (`js/ui/tools/estimate.js`): `openEstimatePart`
  `null` now means all closed (was forced back to the first part); `undefined` still
  opens the first on first render.
- **Fit-only "must fit"** (`js/ui/tools/projects.js`, `js/ui/portal.js`): the mustFit
  checkbox + banner render only when `profileId === 'fit'`; selecting Fit sets
  `mustFit = true` (untickable), leaving Fit clears it.
- **Portal order** (`js/ui/portal.js`): "Printer and colours" panel moved above the
  part panels; wording "in that part below". Why: user requests. All 501 tests pass;
  live verification limited by the preview repeatedly loading quote.html and the
  portal's lack of the app cache-buster.

## Measured resin rate; shrinkage cost (v1.0.32)

- **Resin coat `materialGrams` 2 → 0.088 g/cm²** (`js/postprocessing.js`), from the
  measurement 0.81 g over a 27 × 34 mm tag (9.18 cm²). `migratePostProcessing` corrects
  an existing op still on the placeholder 2 without touching a tuned value. Test in
  `tests/postprocessing.test.js` updated.
- **Shrinkage adds a small cost** (`js/scores.js` cost model `shrinkage: 0.05`), so
  Function (and Fit) read a little dearer for the slicing prep to compensate shrinkage.
  Verified: Function cost 4.4 → 4.1. Why: user's testing figure + note that shrinkage
  is extra slicing effort.

## Commercial categories as percentages; profile fixes (v1.0.31)

- **Percentage model** (`js/pricing.js`): categories carry `percent` (100 = baseline)
  instead of `weight`. `commercialAdjustment` mode is structural — `source` → `'category'`
  (`adjusted = base × percent/100`, adds `base × (percent−100)/100`); no source → `'total'`
  (`added = percent/100 × bases.total`, all new money). `categoryPercent(c)` exported,
  honours older `weight` (×10) and `pct` (×100). `DEFAULT_COMMERCIAL_CATEGORIES` all
  `percent:100`. Settings migration normalises stored `weight`/`pct` → `percent` (resets
  only the pre-`duplicates` shape).
- **UI**: estimate `allocationPanel` read-only columns Category / Calculated / Percentage /
  Applies to ("of category"/"of total") / Charged / To the invoice. Settings editor: a `%`
  input + an "of category"/"of total" pill; **Delete only on added (custom) categories**;
  Add a category defaults to 5% of total. `explain.js`/`export.js` updated to `percent`+`mode`.
- **Radar** (`js/ui/svg/radar.js`): viewBox widened with `hpad` so the side labels
  ("Aesthetics", "Cost") are not clipped.
- **Profile backfill** (`js/settings.js` `migrateSettings`): any print-setting key present
  on a shipped `DEFAULT_PROFILES` profile but absent on the stored one is filled in
  (without touching user-changed values) — so an older saved **Fit** gains `calibrationPass`
  and its Cost score drops to the lowest (dearest). Why: user — percentages clearer than
  weights, calculated categories shouldn't be deletable, Aesthetics label clipped, Fit
  should be worst on cost. Verified live: Fit cost 1.7, Aesthetics label full, delete only
  on custom. Engine tests updated (100% no-op, 110%/90% ±10%, custom = % of total).

## Beds & layout: In 3D heading right, plates left (v1.0.29)

- **`bedPlan` owns its title** (new `title` option, default 'Beds & layout'): renders a
  `.bedplan__head` row with the title left and the "In 3D" heading right (both `h3`), so
  they share one line. `.bedplan__cols` is `justify-content: space-between` and
  `.bedplan__isowrap` is right-aligned, so plates sit left and the iso right. The three
  call sites (`estimate.js`, `projects.js` `bedLayoutPanel`, `portal.js`) no longer
  render their own heading (portal passes `title: 'On the bed'`; projects keeps a plain
  h3 only when there are no parts to lay out).
- **Legend drops the file name** — `Part N ×count` only. The full model name moves to
  the **Part breakdown** table (`partsTable`), which gains a leading `#` column
  (`Part ${index+1}`) before a renamed **Model** column. Why: user's before/after images.
  Verified live: both headings on top=174, In 3D right-aligned, plates left / iso right,
  legend "Part 1 ×1", breakdown "# | Model | …".

## Commercial categories — edit in Settings, add/delete any (v1.0.28)

- **Mode is structural** (`commercialAdjustment` in `js/pricing.js`): a category with a
  real `source` uses the WEIGHT dial (base from `bases[source]`); a category with no
  source (custom/added) is a **percent of the order total** (`pct` × `bases.total`,
  added as new money). `bases.total = partValue + orderExtras` added in the engine.
  Backwards-compatible with the earlier custom `baseRate`.
- **Inputs moved to Settings** (`js/ui/tools/settings.js` → Pricing → Commercial
  categories): weight input for sourced categories, "% of total" for added ones, a
  **Delete on every row** (not just custom), and Add a category. The estimate
  `allocationPanel(result)` is now READ-ONLY — Category / Calculated / Setting /
  Charged / To the invoice — and points to Settings.
- **Part-selector chips** on the estimate now read `Part ${i+1}` instead of the model
  name. Why: user asked to add/delete any category, make sourceless (R0) categories a
  % of total, keep inputs in Settings, and label the chips by position. Verified live
  (estimate panel 0 inputs; Settings has 13 inputs + 13 Delete + Add; chips "Part 1/2").
  Test: a custom category adds 5% of the order total.

## Commercial categories — dial where the money goes (v1.0.27)

- **New model** (`js/pricing.js`): `DEFAULT_COMMERCIAL_CATEGORIES` (each `{id, name,
  source, weight:10}`) + `commercialAdjustment(categories, bases)`. Weight 10 =
  baseline; `adjusted = base × weight/10`; a built-in category adds only `base ×
  (weight-10)/10` to the price (it is already in the total), a `custom` one adds its
  whole `adjusted` (new money; base = `baseRate × productionCost`). Returns `lines`,
  `addToPrice`, `baseTotal`, `adjustedTotal`. `allocate`/`doubleCountWarnings` kept
  as legacy exports for old tests but no longer used by the engine.
- **Engine** (`js/engine.js`): builds `categoryBases` from the order (material,
  machine, electricity, labour, hardware, scrap, packaging, shipping, handling,
  storage, profit, growth, and marketing/admin/rnd/storage split from the general
  allowance by `ctc.allowanceComponents`), calls `commercialAdjustment`, and adds
  `allocation.addToPrice` into `netTotal` before tax. `result.allocation` is now the
  new shape; `allocationWarnings` = []. Invariant: all weights 10 ⇒ price unchanged.
- **Settings** (`js/settings.js`): default `allocations` = `DEFAULT_COMMERCIAL_CATEGORIES`;
  migration resets any old-shaped allocations (fractional weights / `duplicates` / no
  `source`) to the weight-10 defaults so stored prices don’t move.
- **UI**: estimate panel `allocationPanel(ctx, result)` rewritten — Category /
  Calculated / editable Weight / Adjusted / To the invoice, add + remove custom
  categories, live total; Settings "Commercial categories" editor (name + weight +
  custom % + add/remove); `explain.js` and `export.js` updated to the new fields;
  `.cell-input` CSS. Guide FAQ + search aliases. Why: user redesigned the commercial
  shares to show where each order’s money goes and let the company dial each category
  (weight 10 baseline, 11 = +10%), dropping the confusing "already charged" column.
  Verified live: editing Profit 10→13 raised the invoice by 30% of profit, reset to
  10 restored it; no console errors. Engine tests for the invariant + the +10% rule.

## Print-intent profiles reworked, engineering scores (v1.0.26)

- **`js/scores.js`** (new): `scoresFor(settings, model)` computes the five 1–5 scores
  from a profile's settings. Strength = moment of inertia of the wall stack around a
  nominal section (`1 - ((D-2t)/D)^4`, t = wallLoops × lineWidth) + infilled core ×
  pattern × material factor — non-linear, walls dominate. Speed/Cost from plastic +
  softened finish/thin-layer penalties (cost leans on time + finish extras; a
  calibration pass is the single dearest term, making Fit the cost loser). Precision =
  shrinkage + calibrationPass + fine layer/nozzle, MINUS fuzzy skin. Aesthetics = fine
  layer/nozzle + ironing + fuzzy + material behaviour. All coefficients in
  `DEFAULT_SCORE_MODEL`. Tests in `tests/scores.test.js`.
- **Radar** (`js/ui/svg/radar.js`): generalised to an N-axis polygon from `SCORE_AXES`
  (now 5, adds Aesthetics). Portal ships computed `scores` per profile
  (`portal-config.js`); Settings shows the computed radar + the five values and drops
  the manual rating sliders; `calibrationPass`/`adaptiveLayers` toggles added.
- **Material = geometric only.** Removed `empiricalVolume`/`empiricalTime`, the
  `empirical` estimate level, the clamp note and `disagreement` from `js/estimate.js`.
  Retired the 30× behaviour; `js/profiles.js` keeps the factor data inert but adds
  `timeAdjustFor(settings, model)` (`TIME_ADJUST_FACTORS` — finish flags + pattern,
  NOT infill/walls/layer which the geometry already counts) × calibration pass ×
  per-profile `timeFactor`, applied to the quoted time in `estimatePart`. Expert
  explain card and the Settings profile panel now show the time adjustment + a
  `timeFactor` slider. Engine test rewritten (`material is the geometric calculation
  only`, `finish settings adjust the quoted TIME`).
- **Space-claim fill 35% → 60%**, configurable (`spaceClaimFill` in
  `DEFAULT_ESTIMATE_ASSUMPTIONS`, wired through `manualGeometry`, editable in Settings).
- **Bed 3-D** heading renamed "In 3D", moved to the top of a left-packed 2-column
  layout (`js/ui/svg/bed.js`, `css/components.css`).
- **How-to** (`js/ui/tools/guide.js`): three FAQs on the profiles/radar, material vs.
  time, and tuning; search aliases for profile/infill/time-factor. Why: user
  redesigned print-intent to be engineering-grounded and to kill the recurring
  "more than solid" message. Verified live (no console errors, estimate prices,
  Settings shows the time adjustment, radar is the 5-axis computed one).

## Bigger 3-D view, shown solid volume (v1.0.25)

- **Larger iso** (`js/ui/svg/bed.js`): viewBox bumped 400×300 → 760×560. This is the
  real lever, because `capDiagramScale` (`js/ui/patterns.js`) pins each diagram's
  inline `max-width` to its viewBox width — so a CSS `max-width` alone did nothing.
  In-canvas printer-name text and paddings scaled up to match (`topPad` 34, `pad`
  18, name font 14 at y=22). CSS (`components.css`): `.bedplan__cols` is now
  `auto minmax(360px, 1fr)` so the top-view plates take only their content width and
  the 3-D view fills the rest (kills the gap that was wasted space); `.bedplan__grid`
  capped at `max-width:640`; `.bedplan__isohead` set to `font-size:15px; font-weight:700`
  to match the panel's `h3` ("Beds & layout"). Verified live: iso renders 760×560,
  heading computed 15px/700 same as the h3.
- **Solid volume shown** (`js/ui/tools/estimate.js` `partBlock`): when a part has no
  model, the Solid volume field hint now states the calculated figure — `round(L·W·H
  · 0.35)` — with the box volume, instead of "Leave at zero…". The engine already
  used 35% of the box (`manualGeometry` in `engine.js`); this just surfaces it.
  Verified live: "≈ 22,497 mm³ (35% of the 64,277 mm³ box)".

## Bed layout: flag parts that don't fit, simpler labels (v1.0.24)

- **Overflow parts drawn red** (`js/ui/svg/bed.js`): `OVERFLOW_FILL = var(--danger)`
  and `fitsHeight(p, buildZ)` (a placed part fails only on height — footprint
  overflow is caught in `arrangeBed` and never placed). `topSvg` and the iso box
  loop paint the box (and the top-view label) red when `!fitsHeight`. The legend
  builds an `unfitReason(it)` — "too big for the bed" (`plan.overflow`) or "too
  tall" (`size.z > build.z`) — and flags the key with `bedplan__key--over` (red,
  CSS in `components.css`) plus a red swatch and the reason suffix.
- **Cage is the true build volume** again: iso `cageZ = build.z` (was `contentZ*1.15`);
  fit uses `spanZ = max(cageZ, maxPartZ)` so a too-tall part is not clipped and rises
  above the dashed cage. Tower height capped at `min(maxPartZ, cageZ)`.
- **Short box + header labels**: `bedPlan` passes `labelFor = id => 'Part '+(ids.indexOf(id)+1)`
  to `topSvg`, so boxes read "Part 1"/"Part 2" not the model file name (which
  overflowed). Legend leads with the short label then the full name. Estimate
  `partBlock` header (`js/ui/tools/estimate.js`) is now `Part ${index+1}` only;
  project `partSidebar` section title (`js/ui/tools/projects.js`) is `Part ${n}` from
  the part's index. Why: user — full names swamped the picture and duplicated the
  name field below the header. Verified live: red faces/labels, legend "too tall",
  part top above cage, short headers.

## 3-D bed: solid parts, bigger and centred (v1.0.23)

- **Near-face rendering fix** in `isoBox` (`js/ui/svg/bed.js`): the box drew its +x
  and +y faces (the two meeting at the FAR vertical edge d0–D), so parts looked
  inside-out. Now draws the −y (front-right, `[a,b,B,A]`) and −x (front-left,
  `[a,e,E,A]`) faces — the two meeting at the near edge a–A — plus the top. Box
  draw order flipped to farthest-first (`sort((a,b)=>b.key-a.key)`, key=x+y) so
  nearer parts paint over farther ones.
- **Fit/centre rewrite** in `isoSvg`: the cage height was the full build volume
  (`bz`), so flat parts scaled tiny against a tall empty cage. Now `contentZ =
  max part/tower z` and the cage is `contentZ*1.15`. Scale fits the projected
  bounding box (`widthUnit=(bx+by)·AX`, `heightUnit=(bx+by)·AY+bz`) into the frame
  with a top pad for the printer name; `cx`/`cy` computed to centre the bbox
  (previously `cy=H-24` pinned it to the bottom). Verified live: fills 93% width,
  centreX=200, centreY≈159. Why: user reported inside-out parts and wasted white
  space. No test (pure SVG geometry); checked via DOM bbox in the preview.

## Estimate: money breakdown moved up, table renamed (v1.0.22)

- **Order-wide `moneyDiagram` moved** in estimate `main()` (`js/ui/tools/estimate.js`)
  to just after `stockFlags` (under the `noticeStack` notes) and before
  `partsTable`, wrapped in `if (line)` with its own local `sumOver`. Previously it
  sat after the part selector and thirds bar. The per-part `thirdsDiagram` stays
  under the selector; the whole-bed breakdown now reads first.
- **`partsTable` heading renamed** "Parts on this bed" → "Part breakdown". Why: both
  requested directly. Verified live (money top < table top; heading text).

## Bed layout polish and per-part thirds bar (v1.0.21)

- **Iso view: coloured blocks only, shorter tower, rotated.** In `js/ui/svg/bed.js`,
  `isoBox` no longer draws text labels (names stay on the top view). The purge tower
  height is now `max(part z on that plate)` instead of `bz * 0.6`. The whole iso is
  rotated 90° CCW via a `rot90(rect, aw)` helper applied to every placement and the
  reserve, with the build footprint swapped (`bx = area.h, by = area.w`) — this puts
  the back-left top-view tower on the LEFT of the iso, and keeps face shading correct
  because the projection is unchanged (only the input coordinates are pre-rotated).
- **Per-plate purge tower.** `plateNeedsTower(plate)` counts the distinct `materials`
  across a plate's placements; the tower is drawn (top and iso) only when > 1, with a
  fallback to the old bed-wide behaviour when placements carry no material info. Each
  part's `materials` are threaded through `arrangeBed` onto every placement. Callers
  derive a part's materials from the spools its **mix** actually uses (percent > 0)
  plus any colour-by-height bands: estimate (`js/ui/tools/estimate.js`), project
  (`js/ui/tools/projects.js`), portal (`js/ui/portal.js`). Why: a part set to 100% of
  one colour, alone on a plate, was still drawing a tower it never prints. Test in
  `tests/bedplan.test.js` (materials ride through to placements).
- **Colours before parts (estimate sidebar).** `sidebar()` now renders
  `machineSection` before `partsSection`; the "shares one … below/above" wording was
  flipped to match. The project sidebar already had the bed above the part.
- **Per-part thirds bar under the part selector.** In estimate `main()`, the
  `thirdsDiagram({ price: line.price })` block moved to immediately after the
  `select-part` chips (above the order-wide production diagram), so the bar that
  reacts to the selection sits under the selector. Why: user asked for it directly.

## Dashboard: hardware used most (v1.0.20)

- **`byHardware` on the dashboard** — `dashboard()` (`js/analytics.js`) now
  aggregates every `part.hardware` entry across accepted parts (qty × accepted),
  resolves names from `settings.hardware`, and returns `byHardware` sorted desc.
  Rendered as a "Hardware used most" panel in `js/ui/tools/dashboard.js`. Most-used
  filament (`byMaterial`) and overall profit/margin already existed. Why: the owner
  wanted to see what to buy more of. Test in `records.test.js` (2 per part × 3
  accepted = 6). 487 green. (2026-09-11, bda6125)

## Semantic How-to search (v1.0.19)

- **User language → app terms** — `js/ui/tools/guide.js` gained `SEARCH_ALIASES`
  (app term → everyday phrases), `searchText(text)` (folds the phrases for any app
  term present in an item into that item's searchable text), and `guideMatches` (the
  old AND-substring match over the enriched text). `matches` now delegates to it, so
  both the how-tos and FAQs benefit. Why: a reader who doesn't know the app's words
  ("team sync") searches what they'd say ("local save", "cloud"). Locked with
  `tests/guide-search.test.js` (local save→team sync, ran out of filament→reorder,
  client form→portal, unrelated stays unmatched). (2026-09-11, 35c259c)

## Inventory reorders section + closable alerts (v1.0.18)

- **Reorders panel with Reordered/Reject; alerts consolidated** — new
  `reordersPanel(ctx, low)` in `js/ui/tools/inventory.js` at the bottom of the list
  (on-hand → recent movements → reorders): lists `lowStock()` items minus any in
  `state.ui.rejectedReorders`. "Reordered" books a `purchase` movement of
  `restockTo − onHand` (restockTo = 2× reorder point) and clears any rejection;
  "Reject" adds the item to `rejectedReorders`. The stacked top low-stock banners
  were replaced by one `noticeStack` "stock alerts" line (dismissible). The reorder-
  point editor already existed (the `stock-reorder` numberField). Why: the owner
  wanted actionable reorders at the bottom and closable alerts, not a wall of
  banners. 482 tests green. (2026-09-11, bbca964)

## Adaptive layers (v1.0.17)

- **Adaptive layers as a flag factor** — added `adaptiveLayers` to the factor model
  (`js/profiles.js` `DEFAULT_FACTOR_MODEL`, `FACTOR_ORDER`, `FACTOR_LABELS`) as
  `{ kind:'flag', on:{ time:1.15, material:1 }, measured:false }`, so the existing
  `factorsFor` machinery applies the ~15% time uplift automatically when a part's
  settings have it on (no engine change). Added `adaptiveLayers:false` to every
  shipped profile's settings and `adaptiveLayers:1` to every `PUBLISHED_FACTORS`
  column (off ⇒ ×1, so published totals still multiply out and the reproduction
  tests hold). UI checkboxes in the estimator's "This part's settings" and the
  project's `partSettingOverrides` (both via `setOverride('adaptiveLayers')`). The
  simplified client form exposes no advanced flags, so it's left out (noted in
  `BACKLOG.md`). Tests: adaptive-layers factor is 1.15 time / 1 material on, 1/1 off;
  full suite green (482). (2026-09-11, 399a1a6)

## Delivery names the calculated box and courier (v1.0.16)

- **Show the calculated box/courier instead of "cheapest that fits"** — the estimate
  order section (`js/ui/tools/estimate.js`) already auto-picks a box (`choosePackaging`
  → `parcel.container`) and courier; now the auto options NAME the result: the
  Packaging option reads "Automatic — {parcel.container.name} (the parts fit in this)"
  with a muted line giving the box + `parcel.outerDims`, and the Delivery auto option
  names the cheapest fitting courier (`fittingMethods` sorted by basePrice). The
  project delivery select's auto label was reworded to match. Why: the owner wanted to
  *see which box the parts fit in*, not an opaque "cheapest that fits"; the override
  lists stay. Served source verified (labels present); 481 tests green. (2026-09-11, 2ead913)

## Notes fold into one dismissible line (v1.0.15)

- **`noticeStack` — collapse the banner pile, keep danger visible** — new
  `noticeStack(notes, { dismissed, onDismiss })` in `js/ui/controls.js`: danger
  notes render as their own always-visible banners; everything else folds into a
  `<details>` "N notes" line (native expand) whose items each carry a × that calls
  `onDismiss(noteKey)`. `noteKey` is `note.id` or a hash of its text, so a dismissal
  sticks until the text changes. CSS `.notices*` in `components.css`. Wired into the
  estimate main (which had concatenated result.notes + every line's notes — info
  included — into a wall of banners) and the project main, both storing dismissals in
  `state.ui.dismissedNotices`. Why: the owner's screenshot showed ~8 stacked banners;
  they wanted one expandable line with closes. Verified live: 1 danger banner + a "3
  notes" collapsed line with 3 × buttons. (2026-09-11, 3f40d15)

## Estimate parts accordion (v1.0.14)

- **One estimate part open at a time** — `partBlock` (`js/ui/tools/estimate.js`)
  gained an `open` param; with >1 part it renders a collapsed clickable header
  (chevron + "Part N — name" + Remove) and returns early unless open, else the full
  body. `partsSection` holds the open id in `state.ui.openEstimatePart` (defaults to
  the first when the remembered one is gone); clicking a header toggles it, opening
  one closes the rest; "Add another part" opens the new one. CSS `.part-block__toggle`
  /`__chev`/`--collapsed`. Why: three open parts meant endless scrolling with no clear
  part boundaries. Bug caught in review: the `open` param was used before being added
  to the signature — fixed. Verified live: 3 parts → 2 collapsed, 1 open.
  (2026-09-11, 27990e6)

## Bed layout: 3-D view beside top-down, purge tower, selectable (v1.0.13)

- **Two views of one arrangement + tower + click-to-select** — `arrangeBed`
  (`js/bedplan.js`) now carries each part's height `z` onto placements and takes a
  `reserve` (tower footprint) that keeps a back strip clear on every plate (parts
  offset below it), returning a `reserve` rect. `bedPlan` (`js/ui/svg/bed.js`) draws
  BOTH a top-down `topSvg` and an isometric `isoSvg` from the SAME placements, so
  they can't disagree; the tower is drawn on both; plates are clickable
  (`onSelectBed`/`selectedIndex`, highlighted via `.is-selected`) and the iso shows
  the selected plate. New `bedTowerFootprint(settings, slots)` returns the configured
  tower (`estimate.assumptions.purgeTower`, default 30×30) only when >1 distinct
  loaded colour. CSS: `.bedplan__cols` is a 2-col grid (stacks under 720px), plus
  iso/selection styles. Wired into projects/estimate/portal with `state.ui.selectedBed`.
  **Removed** the old single-part `plateInBuildVolume` + `orientationChart` render
  (the build-volume cage and the Y-up/X-up strip) from the estimate and project —
  the two bed views replace them; dropped the now-unused imports. Why: the owner
  wanted the iso to show the same models as the top-down (they diverged), the tower
  visible on the bed, and to click a bed to view it. Locked with a bedplan test
  (height rides through; tower strip stays clear). Verified live: top-down + iso show
  Bracket/Cover/Clip with correct heights and the tower. (2026-09-11, b665eab)

## Fix: project parts read the wrong printer (v1.0.12)

- **Multi-colour section + recorded print use the effective printer** — after the
  shared-bed restructure, two spots still read `part.printerId` (which defaults to
  `bambu-x1e`) instead of the project bed: `partColourBands` (the "Multi-colour (by
  height)" section, so it said "Bambu Lab X1E loads 4" on a Snapmaker project) and
  the "Record a print" attempt's `printerId` (so a booked print was logged against
  the X1E). Fixed: `partColourBands` now takes the effective `printer` from
  `partSidebar` (project unless override); the attempt uses `part.printerOverride ?
  part.printerId : project.printerId`. The scheduler's fallback printer id also
  prefers `project.printerId`. Verified live: Multi-colour shows "Snapmaker U1", not
  X1E. (2026-09-10, fd6b065)

## Stock movement: the reason sets the sign (v1.0.11)

- **Reason-driven movement signs; "Manual adjustment" retired** — the manual
  record-a-movement form (`js/ui/tools/inventory.js`) took a signed "Change" the
  operator had to sign themselves. Now it takes a positive **Quantity** and applies
  `reason(id).sign` (purchase/return +1, production/scrap −1) on record, so the
  reason decides add-vs-remove. The dropdown filters out `adjustment`
  (`MOVEMENT_REASONS.filter(r => r.id !== 'adjustment')`) and labels each option
  "(adds)"/"(removes)"; `adjustment` stays in the model only as the display value
  for old entries and the `reason()` fallback (so `reason('nonsense').id ===
  'adjustment'` still holds). Verified live: production of 50 stores −50, and the
  picker no longer offers adjustment. (2026-09-10, 557f647)

## Workflow-ordered navigation (v1.0.10)

- **Top tabs reordered to the workflow, with group separators** — `buildTabs`
  (`js/main.js`) now renders from a display-only `NAV_GROUPS` (Estimate · Projects/
  Schedule · Dashboard/Quotes/Inventory · Catalogues/Settings · How to use) instead
  of raw `TOOLS` order, inserting a `.segmented__sep` hairline (`components.css`,
  hidden under 640px) between groups. `TOOLS` stays the router/lookup, so only the
  display order changed. Why: the old order didn't read as a workflow. Verified live:
  Estimate|Projects|Schedule|Dashboard|Quotes|Inventory|Catalogues|Settings|How to
  use with 4 separators. (2026-09-10, 0b518e8)

## Mixed-part bed layout, shared across estimate/project/portal (v1.0.9)

- **Different parts positioned together on one plate, drawn** — new pure
  `arrangeBed(items, build)` (`js/bedplan.js`): a shelf packer (largest footprint
  first) that gives x/y positions for every part's oriented footprint, spilling
  onto more plates as each fills, flagging parts too big for the bed. A floor, not a
  nest (same caveat as `partsPerPlate`/`packBed`). Rendered by `bedPlan(items,
  build)` (`js/ui/svg/bed.js`) as top-down small-multiple plate SVGs — each part a
  labelled, colour-coded rounded rect, with a legend and overflow note; a flat plan,
  not isometric, so small parts aren't hidden behind tall ones. CSS `.bedplan*` in
  `components.css`. Wired into all three surfaces from the one component: the
  project `bedLayoutPanel` (replacing the text-only colour split), the estimate main
  (after the thirds diagram), and the portal render (after "Printer and colours").
  Why: the owner wanted to see which parts share each plate and where — for the
  workshop and the client. Locked with `tests/bedplan.test.js` (positions don't
  overlap and stay on the bed; oversize parts overflow; a full bed spills to a second
  plate). Verified live: Bracket ×6 + Cover ×2 + Clip ×12 laid out on one bed,
  colour-coded and labelled. Supersedes the "layout draws only the selected part"
  caveat noted on the v1.0.7 shared-bed entry. (2026-09-10, 47eda04)

## Project shared bed: one printer for the whole job (v1.0.7)

_From a live design discussion (pros/cons of per-part vs per-project printer),
approved by the owner: project-level printer, per-part override, bed layout, one
invoice. Rolls up into the `FEATURES.md` operator feature "Project shared bed"._

- **Printer + loaded filament moved from part → project** — `makeProject` gained
  `printerId` + `slots`; `makePart` gained `printerOverride` (default false, its
  `printerId`/`slots` used only when set). Why: an assembly of many parts should be
  set up once (one bed), matching the estimate's shared-bed model; a part on a
  different machine is the outlier. `PROJECT_VERSION` 1→2; migration lifts the first
  part's printer/slots to the project and flags any part on a different printer as an
  override, so no price silently changes machine.
- **orderFromProject builds a shared plate** — sets `order.plate = { printerId,
  slots }` from the project, and each line's effective printer/slots = the project's
  unless the part is an override. That single `order.plate` is what turns on the
  engine's bed packing, colour split, plate count and layout for projects (the
  estimate already did this; projects never set a plate before).
- **Engine prices overrides off the shared bed** — `calculateOrder` excludes
  `printerOverride` lines from `packBed`/the purge-tower loop (they're not on this
  bed), gives each line its own plate in the per-line map (`line.printerOverride ?
  {printerId, slots} : plate`), and null bed placement for overrides. Non-override
  lines pack together as before.
- **UI**: a project `Printer & loaded filament` section (`projectBedSection`,
  reusing `filamentSlots`) under the project; the part editor's always-on printer
  select/slots replaced by a "Print on a different printer" tick-box that reveals a
  per-part printer + `filamentSlots` only when ticked (seeded from the project bed);
  the part's colour bands / slicer / model read the EFFECTIVE printer. A `Beds &
  layout` panel (`bedLayoutPanel`) reuses `splitByColour` for the beds list and the
  estimate's `plateLayout`/`plateInBuildVolume` for the selected part's plate
  picture. One invoice throughout (the order sums all lines regardless of machine).
  Verified live: 1 printer picker by default, 2 when a part is overridden; Beds &
  layout shows both parts on Bed 1 with the plate SVG. Tests: migration (v2, printer
  lifted, override flagged), shared-bed vs override pricing, per-head slicer/loaded-
  heads moved to project-level. The quote→project colour-split pre-populate stays
  open in `BACKLOG.md`. (2026-09-10, b122c59)

## General allowance = its named categories (v1.0.6, option A)

- **General allowance is the sum of marketing + admin + R&D + storage** — replaced
  the flat single `ctc.generalAllowance` rate with `ctc.allowanceComponents`
  ({marketing, admin, rnd, storage}, each a % of production cost). Why: the user
  asked that the general allowance BE the commercial costs not computed anywhere
  else, so it's legible and adjustable per category (option A — applied to
  production cost, so no circularity). How: `ALLOWANCE_COMPONENTS` list +
  `ctcAllowanceRate(ctc)` helper (sum of components, else legacy rate) in
  `js/settings.js` — one reader; the engine (`calculateLine` and
  `calculateFromCosts`) imports and uses it for `allowanceRate` (companyInternal
  still forces 0). Migration: a stored workshop with no `allowanceComponents` has
  its old rate split 4:2:3:1 across the four so the TOTAL is preserved exactly (no
  price moves on upgrade); `generalAllowance` is then re-synced to the sum every
  load, so drift/snapshots that read it stay correct. Settings → Cost to Company
  and the estimate's Allowances panel now edit the four (each recomputes the cached
  sum); the "How this works → Cost to Company" card itemises them under the
  allowance total. Tests: components sum to the default; an 18% legacy workshop
  keeps 18% after migration; the three "section" engine examples now zero the
  allowance via components. The remaining panel/full-invoice reconciliation stays
  open in `BACKLOG.md`. (2026-09-10, d9d1187)

## Project page: parts, layout, colour-by-height (v1.0.5)

_Rolls up into the `FEATURES.md` operator feature "Project page: parts, layout,
colour". Same "Project part editor" family as the parity cluster; the nozzle and
the quote→project colour-split pre-populate stay open in `BACKLOG.md`._

- **Add another part from the part editor** — the part editor's action row gained
  an "Add another part" button (`js/ui/tools/projects.js`, `partSidebar`) that
  `addPart`s a fresh `makePart` and opens it (`state.activePartId = fresh.id`).
  Why: the multi-part capability already existed (the main Parts panel's "Add a
  part"), but an operator working in the sidebar could not see it and reported
  "can't add multiple parts" — a discoverability gap, not a missing feature. Both
  accounts true: the button existed; it just wasn't where they were looking.
- **Model upload moved to the top of the part editor** — extracted the Model
  subsection into a `modelSection` var and placed it first in the `section('part')`
  array (before Name), so the order is model → name → quantity → print intent.
- **Colour-change-by-height on a project part** — new `partColourBands(part,
  settings, set)` mirrors the estimate's per-part band editor (material + up-to
  height rows, add/remove, the hand-swap warning) using `partColourPlan`/`swapCost`
  (colourplan.js) and `slotLimit` (printers.js); every edit returns a new
  `colourBands` array via `set`. `colourBands` already flowed through
  `orderFromProject` into the engine, so it prices immediately.
- **Removed the %-per-colour mix editor on projects** — dropped the `mixEditor`
  call (and its import) from `partSidebar`. A project is priced from the slicer's
  exact grams per head (the Slicer figures subsection), so the estimate-only
  percentage split added no value; the `mix` data still rides on the part (carried
  from the estimate / defaulted), just no longer hand-edited here.
- **Order-type hint corrected** — updated the order-type field hint to say a
  *company* internal order drops the rejection and general allowances (following
  the v1.0.4 engine change) while an *employee* order keeps them. (2026-09-10, e5c929f)

## Pricing-model clarity (display + corrections + company-internal)

_Rolls up into the `FEATURES.md` operator feature "Pricing-model clarity". The
deeper commercial-share re-model (general-allowance redefinition, full-invoice
categories) stays in `BACKLOG.md` pending sign-off — it changes the price._

- **Commercial-share panel reads honestly** — in `allocationPanel`
  (`js/ui/tools/estimate.js`) the Weight column now prints a plain score
  (`(weight*100).toFixed(0)`, no `%`), the Share stays `fmtRate` (sums to 100%),
  and a new **Already charged** column shows `line.alreadyCharged` for buckets with
  `overlapsDirect` (the real direct cost, already computed by `allocate` in
  `js/pricing.js`) so notional vs actual is visible. Intro/footer `muted` text
  rewritten to explain weight-as-score. Pure display — no pricing change. Why: the
  "weights add to 152% with a % sign" made the panel read as a 150% markup. Verified
  live: weights 20/50/10…, shares total 100%, Labour already-charged R121.00.
  (2026-09-10, be8b055)
- **"How this works" panels show the correction** — `explainCard`
  (`js/ui/explain.js`) gained a `correction` field rendered as `.explain__correction`
  (green left border, `--ok`, in `css/components.css`) directly under the red
  `mistake`. All 12 cards that name a "commonly got wrong" now answer it with a
  "How it actually works" line. Why: a teaching tool must not leave the reader with
  only the misconception. Rule: a card with a `mistake` should always carry a
  `correction`. (2026-09-10, be8b055)
- **Company-internal orders drop the rejection + general allowances** — a project
  whose order type is *internal — company* is priced at bare direct cost. How: new
  `context.companyInternal` in `calculateLine` (`js/engine.js`) — `scrapAllowance`
  and `allowanceRate` are forced to 0 when set; passed from `priceProject`
  (`js/ui/tools/projects.js`) as `isCompanyInternal(project)` (workflow.js). The
  existing `internal` boolean (employee OR company) still drops labour/profit/demand;
  this adds the company-only allowance drop, so employee-internal keeps both (still
  a billed job at cost). Locked with a `tests/engine.test.js` case (employee keeps
  both; company zeroes both and CTC == direct cost). (2026-09-10, be8b055)

## Bug: logo and electricity tariff kept resetting

- **Logo and electricity tariff no longer reset** — both silently reverted to
  their defaults on every load and every team-sync round-trip. Root cause: the
  settings deep-merge `mergeInto` (js/settings.js) hit the `typeof null ===
  'object'` trap — for a field whose default is `null` (`company.logo`,
  `electricityAlternativeId`) with a stored **primitive** (a data-URI string, a
  tariff id), it fell past `typeof base !== 'object'` (false for null) to `typeof
  incoming !== 'object'` (true for the string) and returned `base` (null),
  discarding the stored value. Fix: one guard — `if (base === null || base ===
  undefined) return incoming;` placed before the object checks, so a null default
  lets the stored value win wholesale. Why it looked like a sync problem: sync
  round-trips through `exportAll` → `applyWorkshop` → `migrateSettings` → the same
  merge, so it reset on reconnect too. Proven with a node repl and locked with two
  `tests/settings.test.js` cases (logo + tariff survive migration). Data already
  wiped can't be recovered — re-enter once, then it persists. → harvest candidate:
  the `typeof null === 'object'` deep-merge trap belongs in the skill's pitfalls.
  (2026-09-10, 6ffe645)

## Project part editor: parity with the estimators (Advanced/Expert controls)

_Rolls up into the `FEATURES.md` operator feature "Every estimator control on a
project part". First of the "Project part editor" cluster; the nozzle item
remains open._

- **Project part editor = superset of both estimators** — the project part editor
  gained the Advanced/Expert per-part controls the Estimate tool and client form
  already had and it was missing: the print-setting overrides (infill %, infill
  pattern, wall loops, layer height, shrinkage, angle optimisation, ironing, fuzzy
  skin), a labour-complexity multiplier, a parts-per-plate override, an
  other-direct-cost per part, and the estimate-method selector on the slicer
  figures. Why: the project is where a job is fine-tuned into production, so
  nothing settable on an estimate should be unavailable there. How: two helpers in
  `js/ui/tools/projects.js` — `partSettingOverrides(part, settings, set)` mirrors
  the estimator's "This part's settings" (a sparse `settingOverrides` diff against
  the profile: a value equal to the profile's is deleted, not stored) and
  `partAdvanced(...)` holds parts-per-plate / complexity / other-direct; the
  estimate-method select was added to the existing `slicerFigures`. All gated on
  `state.mode !== 'simple'` (return `null` in Simple), so the render array just
  filters them out. Imported `sliderField`/`moneyField` from controls and
  `INFILL_PATTERNS`/`FACTOR_LABELS` (profiles.js) + `ESTIMATE_LEVELS` (estimate.js)
  — the same constants the estimator uses, so the two screens can never drift.
  Every field already existed on `makePart` and flowed through `orderFromProject`
  into the calc, so the editors drive real numbers, not cosmetics; `updatePart` is
  a shallow merge, so `set({ settingOverrides: next })` replaces the whole object.
  Verified by rendering the tool's `sidebar()` against live state (cache-busted
  import) and asserting every new control's label is present. (2026-09-10, 64f1928)

## Quote & invoice documents (quick wins)

_Rolls up into the `FEATURES.md` operator feature "Readable banking + invoice
thank-you"._

- **Banking details on their own lines** — each banking detail now prints on its
  own line on the quote and invoice instead of collapsing onto one. Why: a client
  could not easily read or copy the bank/account/branch/reference when they ran
  together. How: the field is unchanged (still one multiline string in
  `settings.company.bankingDetails`); the render in `js/ui/export.js` splits it on
  `\n`, trims and drops blanks, and emits one `<p class="sheet__bankline">` per
  line, styled tight (`line-height:1.5`, no `<p>` margin) in `css/components.css`.
  The Settings hint (`js/ui/tools/settings.js`) now tells the user to put each
  detail on its own line, and the textarea grew to 5 rows. No migration — an
  existing single-line value still renders (as one line). (2026-09-08, e35c385)
- **Custom thank-you note on the invoice** — a short thank-you message prints,
  centred and italic, at the foot of an invoice (not on quotes). Why: a personal
  close on the invoice, distinct from the packaging thank-you card in the box.
  How: new company default `thankYouNote` in `js/settings.js` defaults + a
  `== null` migration merge; carried onto the document in `makeQuote`
  (`js/documents.js`) as `doc.thankYouNote`; rendered in `js/ui/export.js` gated on
  `isInvoice && doc.thankYouNote` into `.sheet__thanks`; a company-default editor
  in Settings → Company and a per-document editor section (invoice only) in the
  Quotes & invoices sidebar (`js/ui/tools/documents.js`) that persists to the doc.
  Rule followed: document-level copy is snapshotted onto the doc at build time (as
  terms/refundPolicy/bankingDetails already are), so reprice resets it to today's
  company default — consistent with the other document fields. (2026-09-08, e35c385)

## Project part editor: parity with the estimators, and production

_Rolls up into the `FEATURES.md` operator features on project parts._

- **Components & post-processing editors on a project part** — the project part
  editor gained the same "Components" (embedded hardware) and "Post-processing"
  choices the estimate and client form have, per part. Why: an operator must be
  able to add/change a magnet, insert or NFC tag (and its finishing) on a project
  directly, not only when it arrived from an estimate.
  How: `partComponents`/`partPostProcessing` in `js/ui/tools/projects.js`, reusing
  `gateMatches`/`entryPostOps` from `js/postprocessing.js`; persisted via
  `updatePart` through the part editor's `set()`; after-print components default
  their fit on. (2026-09-07, 75075cf)
- **`mustFit` tick on a project part** — added the client form's "This part must
  fit or mate with another part" checkbox (with the fit-critical reminder banner)
  to the project part editor. Why: the operator could receive the flag on import
  but not set/clear it directly. How: `checkField` + conditional `banner` in the
  part editor, wired `set({ mustFit })`; the field already existed on the part
  model. (2026-09-07, 5f7f9c4)
- **Estimate → project carries every field** — "Save this bed as a project" was
  silently dropping `mustFit`, `colourBands`, `partsPerPlateOverride`,
  `otherDirectCost`, `estimateMethod` and mis-placing the model name. Why: pushing
  an estimate to a project must lose no data. How: completed the mapper in
  `js/ui/tools/estimate.js`; rule — a part has one canonical shape (`makePart`), so
  a mapper must copy every field; carry the model name into the project's
  `modelFileId` (not the estimator's `modelName`), and do not carry estimator-only
  fields the project never reads (`orientedUp`). (2026-09-07, 5f7f9c4)
- **Production draws down real stock** — recording a print now subtracts the
  filament and each component's quantity from the actual stock items on hand; the
  resin bottle too. Why: the draw was booked against an aggregate id that never
  touched the tracked counts. How: `movementsForRun` in `js/inventory.js` gained an
  optional `inventory`, resolving filament to the chosen/emptiest spool and a
  component to the stock item whose `refId` matches, falling back to the synthetic
  `material:`/`hardware:` ids when no inventory is passed (keeps the pure tests
  green, since `balances` keys strictly on `itemId`); resin gated on
  `resinGramsForPart > 0`, not the dead `part.needsResin`; delete-a-print already
  reverses by `runId`. (2026-09-07, cf5ff89)

## Onboarding import

_Rolls up into the CSV-import feature in `FEATURES.md`._

- **Multi-colour printer-history import** — the "Printer history (prior runs)" CSV
  import gained a "Printer for the sample" picker; a multi-head machine (Snapmaker
  U1, Bambu X1E — four heads each) gets a grams and a colour column per head.
  Why: the single-Grams template only fit single-colour printers. How:
  `printRunTemplate(printer)` in `js/imports.js` shapes the sample from the
  printer's `colourSlots` (loaded-at-once heads, 4 — not `maxColours`, 16 for the
  X1E which counts manual swaps); `importPrintRuns` auto-detects `Head N grams/
  colour` columns via a header regex, sums them into the run's total `grams` so
  `machineHistory` (total grams + minutes only) is untouched, and keeps per-head
  `{grams,colour,materialId}` as optional detail; a single `Grams` column still
  imports unchanged. Colour recorded, not costed — prior runs are machine-lifetime
  only. (2026-09-07, 7f7dc09)

## Guide (How-to)

- **Two FAQs written into the guide** — where to choose internal vs customer
  pricing (the project's "Order type", not the quick Estimate) and whether "Save
  all" is still needed with team sync on (no — sync auto-saves; "Save all" is an
  occasional downloadable backup). Why: recurring clarifications worth a straight
  answer. How: two entries in the `FAQS` array in `js/ui/tools/guide.js`.
  (2026-09-07, 5f7f9c4)
