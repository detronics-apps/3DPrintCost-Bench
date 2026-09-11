# Backlog

Open requests, **grouped into feature clusters and roughly ranked** (a cluster is
a set of small requests that ship together as one `FEATURES.md` feature). When an
item ships it moves to `IMPLEMENTED.md` with how it was done; when one is declined
it moves to `REJECTED.md` with why. See the `detronics-app` skill's
`references/backlog.md` for the pipeline. Ranking is a starting point — say the
word to reprioritise.

**Priority order below** (top = do first). The reasoning: fix the data-loss bug
first; then the pricing-model clarity work, because the commercial-share confusion
undermines trust in every number the app shows; then the missing-multiple-parts
project blocker; then the big unifying "step-by-step flow" for the three estimate
surfaces; then inventory/movements and per-roll identity; then analytics, print
settings, nav and the smaller polish. Say the word to re-rank.

## Pricing model: clarity and correctness

_The confusion here touches every quote, so it ranks high. Display + internal-
company allowances shipped in v1.0.4; the deeper re-model below needs sign-off
because it changes the actual price._

- **Commercial-share panel → full-invoice categories that reconcile top-to-bottom**
  — the general-allowance redefinition shipped (option A, v1.0.6: the allowance is
  now the sum of marketing + admin + R&D + storage). What remains is the panel/
  invoice reconciliation:
  - _Categories capture the full invoice._ Every rand of the invoice falls into a
    category. The ones calculated their own way (machine, labour, rejections/scrap,
    profit, packaging, handling) show their **actual computed** rand/share of the
    invoice — not a fixed weight — and the un-accounted four read from the general-
    allowance components now that those are real numbers.
  - _Top and bottom must agree._ The "where the commercial share goes" panel must
    reconcile to the money diagram at the top of the page. (Packaging example: 10%
    notional but a R90 packaging on a R90 part is 50% of that order — categories
    are where the money *actually* goes on the invoice, from the real amount.)
  (Raised 2026-09-10; display shipped v1.0.4; general allowance shipped v1.0.6.)

## Project page & project part editor

_Add-parts, model-first layout, colour-by-height and the %-split removal shipped
in v1.0.5. Remaining:_

- **Auto-estimate the colour split on quote → project** — when a quote becomes a
  project, pre-populate each head's grams from the estimate's colour percentages as
  a starting figure, so the sliced-grams fields aren't blank before slicing; the
  operator then overwrites them with the real slicer totals. (The %-split editor
  itself is already removed from projects.) (Raised 2026-09-10.)
- **Nozzle size affects print time + a nozzle-change operation** — only when the
  company says it uses more than one nozzle size (a company setting; off by default
  so nobody who runs one nozzle ever sees it). Two parts: (1) confirm/make the
  time-per-print respond to the chosen nozzle size — a larger nozzle lays down more
  per pass (faster), a smaller one is slower and finer — so the estimate reflects
  it; check the current model actually does this. (2) When a part needs a nozzle
  other than the machine's current/default one, book a **nozzle-change operation
  both ways** — swap to the needed nozzle before, and back to the default after —
  as a labour/time operation (like the post-processing steps). Per-part nozzle
  choice would live with the other advanced print settings. (Raised 2026-09-08.)

## The three estimate surfaces — one clear step-by-step flow

_Estimate tool, client request form, and a new internal-employee form should all
share the same top-to-bottom, decision-ordered layout. One big cluster._

- **Decision-ordered, no-scroll-back flow** — reorder all three surfaces so the
  user starts at the top and only ever scrolls **down**, following clear steps,
  never scrolling up to make a decision that changes what's above. The step order:
  1. Multicolour / multi-material? (what colours the part needs, up front)
  2. Printer (default set by the company)
  3. Heads / rolls of filament to work with
  4. Model — upload, then part size / dimensions and quantity
  5. Print intent + the colour percentages/assignments
  6. Extra components (hardware)
  7. Post-processing
  8. **Specific inspections** — shown only when a particular print intent is chosen
  9. Delivery — "how would I get the part?"
  10. Packaging
  11. Export / submit
  Make the steps visually clear (almost a stepper). (Raised 2026-09-10.)
- **Auto-minimise sibling dropdowns/sections** — when one section (printer, model,
  …) is expanded, automatically collapse the others, so the flow stays a single
  focused column. Wants A/B testing of whether it helps. (Raised 2026-09-10.)
- **Colour-change-by-height in all three surfaces** — the per-layer colour-change
  handling must be available on the estimate, the client form, and the employee
  form (and the project part editor, above). (Raised 2026-09-10.)
- **Internal-employee estimate form** — a client-form variant for internal
  employees (costed, still quoted+paid per existing order-type rules), sharing the
  same stepped flow. (Raised 2026-09-10.)
- **Auto-email the estimate/request** — a button at the end that opens the user's
  email client with a pre-filled message (a `mailto:` with subject + body): "Hi, I
  want this printed", a reminder to attach any images / technical drawings, and to
  attach the `.3mf` / `.obj` / `.stl`. Recipient = the company email already set in
  Settings. One button, proper heading, ready to send. (Raised 2026-09-10.)

## Inventory & stock movements

_Movement signs-by-reason shipped v1.0.11. Remaining:_

- **Orders record movements on completion** — once an order is complete it should
  book the stock movements automatically; confirm whether this already happens and
  make it so if not, and ensure it pulls through to the Dashboard. (Raised
  2026-09-10.)
- **Keep large dropdowns usable (cascading / filtered pickers)** — as the catalogue
  grows, single long dropdowns for material/colour and stock items become unusable
  (endless scrolling). Break them down: pick **material first, then colour** filtered
  to that material; for a stock line pick the **kind** first (filament / hardware),
  then a category (filament by material; hardware by type, e.g. magnets), so each
  dropdown stays short even years out with many rolls and parts. (Raised
  2026-09-10.)
- **Add-by-filter inventory flow with tick boxes** — replace the current per-type
  add buttons with a filter on the on-hand block: choose a type (filament/spools,
  resin, tools, hardware, packaging), see everything of that type on hand, and
  **tick** the ones you want then press one **Add** — same pattern for packaging,
  etc. The spool-label print sheet likewise becomes tick-boxes: tick the rolls to
  export/print. (Raised 2026-09-10.)

## Per-roll filament identity, labels & CSV backfill

_Extends the existing filament cluster; the CSV items tie inventory to real usage._

- **Per-roll filament tracking, labelling and guided roll selection** — track each
  physical roll individually, right through to finished, even when several rolls
  are the same supplier + colour (e.g. five rolls of "SA Filaments White PLA").
  Pieces:
  - _Per-roll identity & human-readable ID_ — replace the long random spool id with
    a **legible code** with logic: e.g. `PLA` + first 4 of the supplier + the colour
    + a sequence (`001`, `002`, …) counting how many of that spool the company has
    had. Show this roll ID on the roll, in the inventory list, and on the label.
  - _Supplier field_ — add a supplier/brand to a spool (materials have
    `manufacturer`; spools have only batch/location). Report consumption and
    remaining **rolled up by colour + supplier** and per individual roll.
  - _Guided selection / roll spanning_ — the app says which roll to load: prefer the
    nearly-empty roll that can still cover the job (`spoolsFor` already sorts
    emptiest-first); if one roll cannot cover the print, name the next roll to
    continue on; when a later smaller print fits what's left on an earlier roll,
    direct back to that roll to use it up. (Raised 2026-09-07; extended 2026-09-10.)
- **Custom filament-roll labels → downloadable PDF (label-printer sizes)** — a
  company setting turns on a custom label per roll, each carrying that roll's
  human-readable id. Choose the label size to match the label printer (common sizes
  + custom w×h). "Print spool labels" generates a **downloadable PDF** at that size;
  allow **tick-selecting** several rolls into **one PDF**. Builds on the existing
  `buildSpoolLabels` sheet. (Raised 2026-09-07.)
- **Colour swatches on filament colours** — give each material/colour a `colourHex`
  and show a small coloured square next to the colour name everywhere a material is
  listed or picked (Materials catalogue, estimator/project pickers, client form,
  spool labels, slicer head rows). Needs a migration and a reusable swatch element;
  consider a multi-colour/gradient marker. (Raised 2026-09-07.)
- **CSV import → roll-ID matching, one aggregate movement, order type & cost
  impact** — grow the printer-history / usage CSV import so it:
  - _Matches by roll ID_ — instead of picking material + colour, the CSV references
    the **roll ID** that was used and matches the physical roll.
  - _Books one movement per filament_ — a CSV with, say, ten "PLA yellow" lines
    creates **one** aggregate "used in production" movement for the total grams of
    that filament, not ten.
  - _Carries the order type_ — add the client / internal-employee / internal-company
    selection (already in the app) to the CSV import.
  - _Extrapolates cost impact_ — from the printer history (total time + grams per
    filament) and the roll's purchase type, estimate the cost impact on the company
    and add it to the Dashboard stats.
  - _Is the backfill path when the app falls behind_ — if the one person who logs
    prints is out sick while others keep printing, the CSV import is how the missed
    prints (and their stock draw and cost) get entered later; ensure it flows to the
    Dashboard, and document the "what do we do when we've fallen behind" story in the
    How-to. (Raised 2026-09-10.)

## Company analytics & economics

- **Company stats, trends and ROI** — most-used filament (`byMaterial`), most-used
  hardware (`byHardware`, v1.0.20) and overall profit/margin already show on the
  Dashboard. Remaining: an explicit **ROI vs investment** view (profit against
  machines/tooling bought), and trend lines over time (the pieces exist —
  `revenueByMonth` — but no what-to-buy trend yet). (Raised 2026-09-10; most-used +
  profit shipped.)
- **Inflation on stock and labour** — apply a yearly inflation rate (South Africa
  especially) to both bought-in stock cost and the salary behind the labour rate,
  so older figures don't understate today's cost. (Tool depreciation is already
  handled via resale value.) (Raised 2026-09-10.)
- **Maintenance & fix hours reduce profit** — hours spent on printer maintenance
  and on fixing failed prints are real labour that isn't quoted to any customer, so
  they should reduce overall profit. Provide a way to log those hours (see failure
  logging below). (Raised 2026-09-10.)

## Failure logging

- **Partial print-fail count** — when logging a failed print of a multi-part plate,
  allow "N of M failed" rather than the whole print failing (pause/skip means you
  can salvage the rest). (Raised 2026-09-10.)
- **Log the fix time against a failure** — when logging a fail you state the core
  issue; also let the operator log the **solution** and **how long** the fix/
  problem-solving took, feeding the maintenance-hours-reduce-profit item above.
  (Raised 2026-09-10.) _Note: the broader issue↔solution knowledge base (connect an
  issue to solutions already found, so the next fix takes 10 min not an hour) should
  be its **own separate 3D-printing app**, not part of this cost estimator — see
  "Separate apps" below._

## Print-setting model additions

- **Adaptive layers in the client form** — adaptive layers shipped as a flag factor
  on the estimate and the project (v1.0.17, ~15% time uplift). The simplified client
  form does not expose the advanced print-setting toggles (ironing, fuzzy skin, …)
  at all, so adding just adaptive layers there needs a decision on whether to surface
  the advanced flags on the client form. (Raised 2026-09-10; est/project shipped v1.0.17.)

## Cross-cutting UX

- **Hover-to-source links on cost figures** — on the project cost figures (cost to
  company, part price, final invoice, …), hovering a value that is derived should
  offer a link to the section that breaks it down (e.g. hover "cost to company" →
  jump to its breakdown). Not in Simple; optional in Advanced, definitely in Expert.
  (Raised 2026-09-10.)
- **UX / clarity audit of every function** — scan through each function the app has
  and find where the user's understanding and visualisation of what's happening in
  the company could be made easier; produce a list of **recommendations for the
  owner to approve or reject** before any implementation. (Raised 2026-09-10.)

## Workflow & dashboard

- **Dashboard refresh on close, with a Reopen that logs edits** — a closed project
  can go stale on the Dashboard: close with quantity 1 → Dashboard shows 1; later
  change to 4 → it updates everywhere else but the Dashboard still reads 1 (likely
  the price-lock freezing a closed project's figures while the rest reads the live
  part). Desired: a **Reopen** button that logs the reopen to the event history;
  editing a reopened project is allowed; **closing it again refreshes the
  Dashboard** to the new figures; any edit to a closed/reopened project is captured
  in the event history so nothing is silent. Investigate whether the staleness is a
  bug or the intended price-lock the reopen/re-close cycle should govern. (Raised
  2026-09-07.)

## Communication

- **Plus-addressing on the company email** — route different correspondence through
  sub-addresses on the one inbox (`shop.detronics+sales@…`, `…+feedback@…`), with a
  setting mapping tags to purposes so the right address shows in the right place
  (sales on the quote/portal, feedback on aftercare) — all landing in one mailbox.
  (Raised 2026-09-08.)

## How-to / guide additions

- **"What to do when you've fallen behind" guide** — document the CSV-import backfill
  story (someone was out, prints piled up un-logged) so operators know how to catch
  the app up. (Raised 2026-09-10.)
- **Order-flow flowchart in How-to (decision-driven, by section)** — a detailed
  flowchart of the whole process, estimate → quoting → payment → production →
  post-processing → packaging → delivery → aftercare/feedback, laid out in **columns
  per section**, showing how the company's configured options and the client's
  selections route an order — which decision makes it jump from which section to
  which. Specific, not generic: expedite (skip quote/pay → production), order type
  (customer vs internal-employee vs internal-company), packaging vs pickup vs none,
  post-processing routing, plus hold/cancel/reopen off-ramps. Reflects what THIS
  company has switched on, and is shareable with the client. Builds on
  `js/workflow.js` PHASES / `advance` / `clientProgressReport`; a diagram, so
  consider the diagramming approach. (Raised 2026-09-08.)
- **Suppress/reword the "save a backup" reminder while team sync is connected** —
  redundant once sync auto-saves to the shared file; soften or hide it when a sync
  file is connected. (Raised 2026-09-07.)

## Separate apps (not this cost estimator)

- **3D-printing troubleshooting knowledge base** — a catalogue of failure issues
  versus solutions found (with the time each took), so a recurring problem is solved
  from the log in minutes instead of re-diagnosed for an hour. The owner wants this
  as its **own dedicated 3D-printing app**, not bolted onto the cost estimator. The
  *cost* side of it (logging fix/maintenance hours against a project so they reduce
  profit) stays in this app — see "Failure logging" above. (Raised 2026-09-10.)

## Sanity checks to run (validation — user to do)

- **Estimate vs a real sliced part** — slice a real part and compare the app's time
  and material estimate against the slicer's (feeds the calibration loop and the
  estimator assumptions). (Raised 2026-09-08.)
- **Resin used on an NFC tag** — measure the actual grams of resin used to
  coat/embed an NFC tag and record that tag's size, so the resin-coat op's
  grams-per-cm² can be set from real data rather than a guess. (Raised 2026-09-08.)
- **Snapmaker print-history upload** — upload all the Snapmaker prints (Settings →
  Backup & restore → Printer history import) to compare the app's filament-usage
  estimate against actual; prompted by running out of white PLA on a roll before its
  tracked amount said it should. Validates the grams estimate and roll tracking.
  (Raised 2026-09-08.)
