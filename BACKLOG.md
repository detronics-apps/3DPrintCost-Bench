# Backlog

Open requests, **grouped into feature clusters and roughly ranked** (a cluster is
a set of small requests that ship together as one `FEATURES.md` feature). When an
item ships it moves to `IMPLEMENTED.md` with how it was done; when one is declined
it moves to `REJECTED.md` with why. See the `detronics-app` skill's
`references/backlog.md` for the pipeline. Ranking is a starting point — say the
word to reprioritise.

## Sanity checks to run (validation — user to do)

- **Estimate vs a real sliced part** — slice a real part and compare the app's
  time and material estimate against the slicer's, to see how closely they relate
  (feeds the calibration loop and the estimator assumptions). (Raised 2026-09-08.)
- **Resin used on an NFC tag** — measure the actual grams of resin used to
  coat/embed an NFC tag and record that tag's size, so the resin-coat op's
  grams-per-cm² can be set from real data rather than a guess. (Raised 2026-09-08.)
- **Snapmaker print-history upload** — upload all the prints done on the Snapmaker
  (via Settings → Backup & restore → Printer history import) to compare the app's
  filament-usage estimate against actual; prompted by running out of white PLA on
  a roll before its tracked amount said it should. Validates the grams estimate
  and roll tracking. (Raised 2026-09-08.)

## Feature clusters

### Project part editor — the most capable editor

- **Project part editor = superset of both estimators** — the project is where a
  job is fine-tuned as it goes into production, so its part editor should expose
  *every* per-part control the main Estimate tool and the client form offer — and
  today it is missing the Advanced/Expert ones. Bring across, mode-gated
  (Advanced/Expert) the same way the estimator gates them: the print-settings
  overrides (infill %, infill pattern, wall loops — the nozzle/infill tuning, via
  `settingOverrides`), labour complexity, the parts-per-plate override and
  other-direct-cost (fields already carry into a project — they just need
  editors), and the estimate-method / slicer-figures controls. End state: nothing
  you can set on an estimate (internal or client) is unavailable on the project.
  (Raised 2026-09-08.)
- **Nozzle size affects print time + a nozzle-change operation** — only when the
  company says it uses more than one nozzle size (a company setting; off by default
  so nobody who runs one nozzle ever sees it). Two parts: (1) confirm/make the
  time-per-print respond to the chosen nozzle size — a larger nozzle lays down more
  per pass (faster), a smaller one is slower and finer — so the estimate reflects
  it; check the current model actually does this. (2) When a part needs a nozzle
  other than the machine's current/default one, book a **nozzle-change operation
  both ways** — swap to the needed nozzle before, and back to the default after —
  as a labour/time operation (like the post-processing steps). Per-part nozzle
  choice would live with the other advanced print settings (above). (Raised
  2026-09-08.)

### Filament & inventory management

- **Per-roll filament tracking, labelling and guided roll selection** — track each
  physical roll individually, right through to finished, even when several rolls
  are the same supplier + colour (e.g. five rolls of "SA Filaments White PLA").
  Pieces:
  - _Per-roll identity & label_ — each spool already has a unique id and there is a
    "Print spool labels" sheet (material, batch, location, id). Confirm/extend so
    every roll — including duplicates of the same supplier+colour — gets its own
    printable label with a human-friendly code, stuck on the roll, so you can see
    which physical roll is which and roughly what level it is at.
  - _Supplier field_ — add a supplier/brand to a spool (materials have
    `manufacturer`; spools have only batch/location). Then report consumption and
    remaining **rolled up by colour + supplier** (how much "SA White PLA" is
    finished / still on hand across its rolls), and per individual roll.
  - _Guided selection / roll spanning_ — instead of the operator guessing, the app
    says which roll to load: prefer the nearly-empty roll that can still cover the
    job (finish it first — `spoolsFor` already sorts emptiest-first). If one roll
    cannot cover the print, tell the operator which next roll to continue on; and
    when a later, smaller print fits in what is left on an earlier roll, direct
    them back to that filament id to use it up. Production already books the draw
    against the emptiest spool; the new part is surfacing the "load roll X, then
    roll Y" guidance and letting a job span/allocate across specific rolls.
  (Raised 2026-09-07.)
- **Custom filament-roll labels → downloadable PDF (label-printer sizes)** — a
  company setting turns on making a custom label per roll of filament, each
  carrying that roll's specific id/code. Let the company choose the label size to
  match their label printer (a set of common sizes, plus a custom w×h). "Print
  spool labels" then generates a **downloadable PDF** sized to that label, to send
  to the label printer (today's spool labels are a browser print sheet — this adds
  a proper PDF at a chosen size). Allow selecting several rolls and generating
  **one PDF with all their labels**. Builds on the existing `buildSpoolLabels`
  sheet; the id/code on the label is the roll's identity from the item above.
  (Raised 2026-09-07.)
- **Colour swatches on filament colours** — give each material/colour a colour
  code (a hex value) and show a small coloured square next to the colour name
  wherever a material is listed or picked: the Materials catalogue, the estimator
  and project filament/head pickers, the client form, spool labels, and slicer
  head rows. Would need a `colourHex` field on a material (with a sensible default
  and an editor/colour-picker in Catalogues → Materials), a migration to add it,
  and a small reusable swatch element. Consider a multi-colour/gradient material
  (e.g. silk rainbow) — maybe two stops or a "varies" marker. (Raised 2026-09-07.)

### Workflow & dashboard

- **Dashboard refresh on close, with a Reopen that logs edits** — a closed project
  can go stale on the Dashboard: close with quantity 1 → the Dashboard shows 1;
  later change the quantity to 4 → it updates everywhere else, but the Dashboard
  still reads 1. (Likely because a closed/invoiced project's figures are frozen by
  the price-lock, while the rest of the app reads the live part.) Desired flow: a
  **Reopen** button on a closed project that logs the reopen to the event history;
  editing a reopened project is allowed; **closing it again recomputes/refreshes
  the Dashboard** to the new figures. And any edit made to a closed (or reopened)
  project should be captured in the event history, so a change to a finished
  project is never silent. Investigate whether the Dashboard staleness is a bug to
  fix directly or is the intended price-lock behaviour that the reopen/re-close
  cycle should govern. (Raised 2026-09-07.)

### Communication

- **Plus-addressing on the company email** — let the company route different kinds
  of correspondence through sub-addresses on their one inbox, e.g.
  `shop.detronics+sales@…` and `shop.detronics+feedback@…` (the "+tag" that Gmail
  and most providers deliver to the base address). A setting to define the tags /
  which purpose uses which, so the right address shows in the right place — a sales
  address on the quote/portal, a feedback address on the aftercare/thank-you — all
  landing in the single mailbox. (Raised 2026-09-08.)

## How-to / guide additions

- **Order-flow flowchart in How-to (decision-driven, by section)** — generate a
  detailed flowchart of the whole process, estimate → quoting → payment →
  production → post-processing → packaging → delivery → aftercare/feedback, laid
  out in **columns per section**, that shows how the company's configured options
  and the client's selections route an order — i.e. which decision makes an order
  jump from which section to which. It must be specific, not generic:
  - _Expedite_ — if the company offers expedite and the client picks it (pays the
    estimate up front), show the order skipping the normal quote-then-pay wait and
    jumping straight toward production; if not picked, the normal path.
  - _Order type_ — customer order vs internal-employee (cost, still quoted+paid)
    vs internal-company (cost, an expense; skips quote and payment straight to
    production); show each jumping to the right section.
  - _Packaging_ — packaging vs pickup vs no-packaging, and which of the Packaging
    / Delivery sections each keeps or skips.
  - _Post-processing_ — whether any finishing is selected (and which), routing
    through or around the Post-processing section.
  - Plus hold/cancel/reopen off-ramps.
  It should reflect what THIS company has switched on (so it mirrors their own
  setup), help them understand how their system routes orders, and be shareable
  with the client later so they see the bigger picture. Builds on the existing
  workflow phases (`js/workflow.js` PHASES / `advance` / `clientProgressReport`);
  a diagram, so consider the diagramming approach. (Raised 2026-09-08.)
- **Suppress/reword the "save a backup" reminder while team sync is connected** —
  the periodic backup nudge is redundant once sync auto-saves to the shared file;
  soften or hide it when a sync file is connected. (Raised 2026-09-07.)
