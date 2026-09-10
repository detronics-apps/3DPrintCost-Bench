# Implemented

Every small request that has shipped, newest first, with why it was done and
**how** — enough that the same thing could be reproduced in another Detronics app
without re-deriving it. The granular ledger; the grouped, user-facing write-up of
each cluster lives in `FEATURES.md`. See the `detronics-app` skill's
`references/backlog.md` for the pipeline (`BACKLOG.md` → here / `REJECTED.md`).

_This ledger begins 2026-09-08. Features that shipped before then are recorded in
`FEATURES.md` and the git history._

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
