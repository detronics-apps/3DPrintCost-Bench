# Implemented

Every small request that has shipped, newest first, with why it was done and
**how** — enough that the same thing could be reproduced in another Detronics app
without re-deriving it. The granular ledger; the grouped, user-facing write-up of
each cluster lives in `FEATURES.md`. See the `detronics-app` skill's
`references/backlog.md` for the pipeline (`BACKLOG.md` → here / `REJECTED.md`).

_This ledger begins 2026-09-08. Features that shipped before then are recorded in
`FEATURES.md` and the git history._

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
  banners. 482 tests green. (2026-09-11, <commit>)

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
