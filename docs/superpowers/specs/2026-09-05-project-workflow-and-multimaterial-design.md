# Design — project workflow, multi-material heads, and the fixes

_2026-09-05. Branch `feature/project-workflow-multimaterial`. Nothing is pushed;
this is for review before publishing._

This gathers the seven changes asked for into one plan, with the design decisions
made and — where a decision is genuinely the user's to make — the assumption I
chose, flagged **[DECISION]** so it can be corrected on review.

## The seven items

1. **Split the top-bar "Open"** into two buttons:
   - **Open** — load a whole **company/workshop** backup wholesale (switch
     companies, e.g. after an app update). This is the existing
     `restoreFromFile` behaviour (replace everything, confirm first), which today
     only lives in Settings → Backup & restore.
   - **Upload project** — merge in a client's request JSON (or any saved
     project file). This is the existing top-bar "Open" behaviour
     (`importFile({ merge: true })`).
2. **Project status → a guided Next / Previous stepper**, not a bare dropdown.
   Each stage shows what is done and what the next actions are.
3. **Remove a part** from a project directly in the parts list (add exists; the
   detailed remove already exists in the part sidebar — add a convenient one to
   the list too).
4. **Delete a recorded print** in production (undo a double-click or a
   planned-but-not-run entry), reversing its stock movements.
5. **Auto-fill filament heads/spools from the client quote** on a project part:
   a multi-material printer (Snapmaker, up to 4 heads) pre-fills each head's
   material + colour; a single-colour printer asks for one material + one colour.
6. **Per-head grams + one total print time** entry on a project part
   (post-slicing manual input).
7. **Fix the scroll-jump** in the client-facing portal when adding a head /
   colour / part.

## What the code already gives us

- The **engine already supports multi-material** through `line.slots`
  (what is loaded) and `line.mix` (each part's share per slot) — see
  `js/filaments.js`, `js/engine.js:128`. The estimator (`js/ui/tools/estimate.js`)
  and the portal (`js/ui/portal.js`) both use the `filamentSlots` + `mixEditor`
  UI from `js/ui/filament-slots.js`. **Project parts do not carry `slots`/`mix`
  at all** — `js/projects.js:makePart` has only `materialId` + a `colours` count,
  and `orderFromProject` passes only `materialId`, so a project always collapses
  to a single synthesised slot. That single gap is the whole of item 5.
- The main app's render loop **already restores scroll + focus** across a rebuild
  (`js/main.js:render` via `captureFocus`/`restoreFocus`). The **portal's
  `render()` does not** (`js/ui/portal.js:389` just `clear(host)` and rebuilds),
  which is item 7.
- `removePart` and a "Remove" button exist in the part sidebar
  (`js/ui/tools/projects.js:515`). There is **no `removeAttempt`** — item 4 needs
  one, plus reversing the inventory movements the print booked out.

## Item-by-item design

### 1. Open vs Upload project (`js/main.js`, `js/state.js`)
- Rename the current top-bar **Open** to **Upload project** — same handler
  (`importFile({ merge: true })`), which already reads both `kind:'project'`
  request files and full-workshop files (merging projects/customers only).
- Add a new **Open** button whose file handler calls `restoreFromFile` (wholesale
  replace), confirming first when there is anything to lose.
- **Guard the shapes** so the two buttons cannot be crossed:
  - `restoreFromFile` already refuses a file with no `settings`. Add a refusal for
    `kind:'project'` files (a client request also carries `settings`) with a
    message pointing at Upload project.
  - Order in the bar: Open · Upload project · Save all · theme.
- **[DECISION]** "Open" replaces the current workshop wholesale. That is the
  switch-companies behaviour asked for; it confirms first, and the safety net is
  that each company is its own "Save all" file.

### 2. Status stepper (`js/projects.js`, `js/ui/tools/projects.js`)
- Add a **pipeline order** the Next/Previous buttons walk. The existing statuses
  are draft, quoted, accepted, in-production, complete, invoiced, cancelled,
  archived. The user's described flow puts invoicing and payment before
  production.
- **[DECISION]** Pipeline: **draft → quoted → accepted → invoiced → paid →
  in-production → complete**, with **cancelled** and **archived** as off-pipeline
  states reachable by their own buttons. A new **`paid`** status (tone `ok`) is
  added; `PROJECT_STATUSES` gains it and a `PROJECT_PIPELINE` array names the
  order. This is additive — nothing that switches on the existing ids breaks.
- The stepper UI (replacing the bare status dropdown in the project sidebar, and
  a focused header panel in the main view) shows: the current stage, a
  **Previous** and **Next** button, and a short "what this stage is for / what to
  do next" line. Creating a quote / invoice already advances the status; the
  stepper's Next simply calls `setStatus` along the pipeline and records history.
  A dropdown to jump directly is kept for off-pipeline moves.
- Built entirely from existing controls (`button`, `pill`, `muted`, `statTile`,
  `banner`) so no new CSS/classes — the contract test stays green.

### 3. Remove a part from the list (`js/ui/tools/projects.js`)
- Add a small "Remove" action to each row of the parts panel (calls the existing
  `removePart`), with a confirm. Reuses the existing button control.

### 4. Delete a print (`js/projects.js`, `js/inventory.js` usage, `js/ui/tools/projects.js`)
- Add a pure `removeAttempt(project, partId, attemptId)` to `js/projects.js`
  (returns a new project, drops the attempt).
- In the UI, a "Delete" button on each attempt row. Deleting also **reverses the
  stock movements** that the print booked out: movements carry a run reference,
  so the delete removes the matching movements from `state.inventory.movements`.
- **[DECISION]** Deleting reverses stock rather than posting a compensating
  "return" movement, because the intent is "this print did not happen"; a
  double-click leaving two rows should net to zero stock, not two out + two back.

### 5. Multi-material heads on a project part (auto-filled from the quote)
Files: `js/projects.js`, `js/portal-request.js`, `js/ui/portal.js`,
`js/ui/tools/projects.js`.
- **Data model**: `makePart` gains `slots` (array `[{id, materialId}]`, default
  `null`) and `mix` (array `[{slotId, percent}]`, default `null`). `migrateProject`
  fills the defaults, so old projects are unchanged (null → engine synthesises one
  slot from `materialId`, exactly as today).
- **`orderFromProject`** passes `slots` and `mix` through to each line. The engine
  already reads `line.slots`/`line.mix`, so pricing "just works" for
  multi-material once the data is present.
- **Portal payload** (`js/ui/portal.js:makePayload`): include the bed `slots` and
  each part's `mix`. **`portal-request.js`** maps those onto the project part's
  `slots`/`mix` (per part — a project part can have its own printer, so slots live
  on the part, matching the estimator's per-bed model translated to per-part).
- **Project part UI**: replace the single material picker + colours-number with
  the shared `filamentSlots` editor (driven by the part's printer: single-colour →
  one material + one colour; multi-material → up to `slotLimit` heads, each
  material + colour) and the `mixEditor`. This is the same component the estimator
  and portal use, so the three cannot disagree.
- The `colours` count field is retired for the head-based model; a migration
  seeds `slots` from `materialId` when a stored part has none, so the readout is
  unchanged for single-colour parts.

### 6. Per-head grams + total time (`js/estimate.js`, `js/engine.js`, `js/ui/tools/projects.js`)
- The project part's "Slicer figures" become: **one grams field per loaded
  head/spool**, plus **one total print-time field** (not per head).
- Stored as `part.slicer = { minutes, heads: [{ slotId, grams }] }`. The single
  `slicer.grams` becomes the sum, kept for backward compatibility and for the
  estimate readout.
- **Pricing path**: when per-head grams are present they are the authoritative
  per-filament weights. `estimatePart`'s slicer level builds its per-filament
  breakdown from the actual grams (volume = grams ÷ density, per head), so total
  material weight and each head's weight are exactly what the slicer reported. The
  engine's material cost uses those per-head grams directly when present, falling
  back to the existing volume×mix split otherwise.
- **[DECISION]** This is the one change that alters a pricing number's *source*
  (actual per-head grams instead of the geometry-derived split). It only activates
  when the user enters per-head grams; every existing quote/estimate is untouched.
  Flagged for review because it is a deliberate pricing-behaviour choice.

### 7. Portal scroll-jump (`js/ui/portal.js`)
- Wrap the portal's `render()` in `captureFocus`/`restoreFocus` (from
  `js/ui/patterns.js`) using the page scroller (`document.scrollingElement`), the
  same fix the main app already uses. The portal's controls already carry
  `data-field` names, so focus + caret survive too. Every interaction (add head,
  add part, mix change, profile chip) will keep its scroll position.

## Migrations & backward compatibility
- `makePart`: new `slots`/`mix` default `null`; `slicer` may gain `heads`.
  `migrateProject` seeds `slots` from `materialId` when absent and normalises
  `slicer`. Tested against a literal old blob (the project's migration discipline).
- No stored status is removed; `paid` is added. `statusOf` still falls back to
  `draft` for unknowns.

## Testing
- `records.test.js` / `tests/portal-request.test.js`: `removeAttempt`, the
  slots/mix on a project part, `orderFromProject` carrying them, the portal
  request carrying heads + mix, and the migration seeding slots.
- `engine.test.js` / `estimate` coverage: per-head grams produce the exact
  per-filament weights and cost.
- `contract.test.js` must stay green — reuse existing classes/tones; the new
  `paid` status uses tone `ok`.
- Full suite (`npm test`, 381 baseline) must pass.

## Guide
Every new feature is written up in `js/ui/tools/guide.js` (standing rule): the
Open/Upload split, the status stepper, deleting a print, multi-material heads on a
project, and per-head slicer grams.

## Order of work (each its own local commit)
1. Portal scroll fix (7)
2. Delete a print (4) + remove-part-from-list (3)
3. Open / Upload split (1)
4. Status stepper (2)
5. Project multi-material heads + auto-fill from portal (5)
6. Per-head grams + total time (6)
7. Guide updates + full test run
