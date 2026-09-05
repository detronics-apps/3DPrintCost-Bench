# Design — the six-phase order workflow

_2026-09-05. Branch `feature/project-workflow-multimaterial`. For review before
any code is written (you chose "spec first"). Nothing here is pushed._

This replaces last session's simple Next/Previous status stepper
(`PROJECT_PIPELINE`, `workflowPanel`, `STAGE_GUIDE`, the `paid` status) with a
phase-based workflow that drives the whole order from imported client estimate to
final closeout. The guiding principle is **minimum manual administration, maximum
automatic state detection**: the app already records what happened, so progress is
derived from that data wherever possible, and the operator is only asked for
genuine decisions.

## Locked decisions (from review)
1. **Delivery approach**: write this spec first; implement after you approve it.
2. **Leaving the pipeline**: **Cancel + On-hold**, available from any active
   phase. On-hold pauses without losing the place (it remembers the phase to
   resume to); Cancel is a terminal off-ramp with a reason. Both are logged.
3. **Awaiting Payment → Production**: a **manual "Payment received"** action only.
   The invoice's outstanding balance is shown as information, but it does not
   auto-advance the order. (Chosen so cash/EFT paid outside the invoice tracker
   is handled the same way.)

## The phases

Six operational phases, with **Awaiting Payment** as a waiting state between
Quotation and Production. The external client estimate is deliberately outside the
internal workflow — an imported request lands directly in Quotation.

```
                                (manual: Payment received)
quotation ──sent──▶ awaiting-payment ──────────────▶ production
   │                                                     │
   │ (issue) return-to-client                            │ reprint loop (stays here)
   ▼                                                     ▼ (inspection passed)
 [stays in quotation]                        post-processing ──(or skipped)──▶ packaging
                                                                                   │
                                                             ▶ delivery ◀──────────┘
                                                                   │ (delivered)
                                                                   ▼
                                                               closeout ──▶ closed
```

Off-ramps from any active phase: **on-hold** (resumes to the stored phase) and
**cancelled** (terminal). `closed` is the normal terminal state.

`phase` field values: `quotation`, `awaiting-payment`, `production`,
`post-processing`, `packaging`, `delivery`, `closeout`, `closed`, `cancelled`,
`on-hold`.

### Phase by phase

**Quotation.** The imported estimate is reviewed and the parts are put through the
existing internal costing/slicing to turn a preliminary estimate into a verified
quotation. Not a big checklist — the one decision surfaced is *"any issue with the
requested parts/requirements?"*. If yes, **Return to client** logs the issue and
holds the order in Quotation for correction. If no, the operator slices and
verifies (existing functionality), then **creates and sends the quote**, which
advances to Awaiting Payment. Phase progress is derived: parts sliced (all parts
have slicer figures) → quote created → quote sent.

**Awaiting Payment (waiting state).** Shows that the quotation is issued and the
order cannot proceed until paid; the invoice's outstanding balance is shown. The
operator clicks **Payment received** (manual) when the money is in. Payment is the
client's acceptance — there is no separate approval step. On payment the order
advances to Production and a **payment-confirmation / paid-invoice** notice is
generated for the client.

**Production (one phase, internal stages + reprint loop).** Covers scheduling,
printer prep, printing, recording results and inspection — all one physical
process, not separate top-level phases. Progress is derived from existing data:
whether the job is scheduled, whether print attempts/reports have been recorded,
and how many accepted units exist against the quantity required. A simple
**inspection decision** on completion: if the required quantity and quality are
met, Production completes; if there are failed/unacceptable parts, the order
enters a **reprint loop within Production** — record the result, mark that more
printing is needed, return to printing — repeating until inspection passes. No
separate Reprint phase.

**Post-Processing.** Active only when post-processing is required (any part with
resin, support removal, deburring, or an after-print component to fit — the app
already knows this). If nothing is required, the phase is **auto-skipped** and the
order goes straight to Packaging. If required, the app tracks completion and then
advances to Packaging.

**Packaging.** Begins once printing and any post-processing are complete. Uses the
existing packaging suggestion/data. When the parcel is physically ready, the
operator marks it **ready for collection**; responsibility then passes to the
delivery service.

**Delivery.** From courier/PUDO collection until delivered — the period the
package is outside the company's control. Uses existing courier/shipping/tracking
info. On **delivery confirmed**, the order moves to Closeout.

**Closeout.** Stays active ~1–2 weeks after delivery. Purpose is the customer
relationship, not production: a simple way to ask the client whether they are
happy, whether there were problems, whether anything should change next time,
whether they need more prints, and whether they were satisfied overall. The
response is recorded, but the order does not stay open indefinitely — after the
closeout window, or once the closeout is completed, it is marked **closed**.

## The pure workflow engine — `js/workflow.js` (new, testable, no DOM)

One module, imported by the project UI. Given a project (and its settings), it
returns everything a screen needs, computed from recorded data plus a small set
of human-decision markers.

```
PHASES            ordered [{ id, name, weight }]
phaseOf(project)  → the current phase object (from project.phase)
workflowState(project, { settings }) → {
  phase,                     // current phase object
  phaseProgress,             // 0..1 for the current phase
  overallProgress,           // 0..1 across the whole order
  steps: [{ label, done }],  // the short, meaningful checkpoints for this phase
  decisions: [{ id, prompt }],       // genuine decision points to surface
  actions: [{ id, label, tone, primary, to }],  // phase-appropriate buttons
  nextExpected,              // the next phase, for "what happens next"
  blocked,                   // e.g. awaiting payment
}
advance(project, actionId, payload?)  → new project (pure): applies the
    transition, sets the relevant workflow marker, logs the event, sets phase.
skipIfEmpty(project)                  → advances past a phase that is not needed
    (post-processing with nothing to do)
```

### Auto-detection rules (derived, not ticked)
- **Sliced**: a part is "sliced/verified" when it has slicer figures
  (`part.slicer` grams or minutes, per the totals model just fixed).
- **Quote created / sent**: from `project.quotes` and their document status.
- **Paid**: shown from the latest invoice's outstanding (`documents.outstanding`),
  but advancement is the manual *Payment received* action (locked decision 3).
- **Production progress**: `projectStats(project)` — accepted vs required units —
  plus whether a print attempt exists (printing has started) and whether the job
  is scheduled.
- **Post-processing required**: any part with `needsResin`, `needsSupport`,
  `needsDeburring`, or an after-print hardware component with `fit`. If none →
  skip.
- **Delivery**: shipping method + tracking already on the order.

### Human-decision markers (the only things stored beyond existing data)
On `project.workflow`:
```
quoteIssue: null | { note, at }        // returned to client
paymentReceivedAt: null | iso
productionStartedAt: null | iso        // optional; also inferable from attempts
inspection: null | { passed, at, note }
postProcessingDoneAt: null | iso
readyForCollectionAt: null | iso
collectedAt: null | iso
deliveredAt: null | iso
closeout: null | { happy, problems, notes, wantsMore, satisfied, at }
closedAt: null | iso
```
Plus `phase` and `onHoldFrom` (the phase to resume to) on the project itself.

### Progress weighting (overall %)
Weighted by effort, normalised, with a skipped phase counted as complete:
Quotation 15, Awaiting Payment 5, Production 35, Post-Processing 10,
Packaging 10, Delivery 15, Closeout 10 (= 100). Overall =
Σ(weightᵢ × phaseProgressᵢ) ÷ Σ(weights, skipped counted at full). These weights
live in `PHASES` and are easy to change.

## Event history

Extend the project's existing `history` into a typed, chronological event log —
one log, not two. Entry shape (backward compatible with the current
`{ at, from, to, note }`):
```
{ id, at, type, phaseFrom, phaseTo, text, meta? }
```
A pure `logEvent(project, type, text, meta)` appends one. Events are recorded
automatically at: estimate imported, quote created/sent, payment received,
production started, each print result recorded, inspection result, each reprint
cycle, post-processing complete, packaging complete, ready-for-collection,
courier collection, delivery confirmed, closeout feedback, closed, on-hold,
resumed, cancelled, returned-to-client. Recording flows through `advance()` and
through `recordAttempt`/`removeAttempt`, so the operator maintains no separate
history. The project view shows it as a reverse-chronological timeline.

## Client progress update (manual now, automatable later)

Pure `clientProgressReport(project, state)` → plain text stating: the company and
customer, the current phase, overall progress, completed major stages, current
activity, and the next expected stage. A **Copy client update** button puts it on
the clipboard for an email or message. The function is written so a future
version can call it automatically on each phase advance (the transition point in
`advance()` is the natural hook).

## Dynamic project UI

The project view's workflow panel is rebuilt to be phase-driven:
- an **overall progress bar** (prominent) with the phase name and % ;
- a **phase progress bar** with the current phase's short `steps` (meaningful
  checkpoints, not an admin checklist);
- the **next required action made obvious** (primary button), with the
  phase-appropriate secondary actions only;
- the decision points for the phase (e.g. issue? / inspection pass? / reprint?);
- **Cancel** and **On-hold** available in any active phase; **Resume** when held;
- an **Event history** timeline and a **Copy client update** button.

Actions shown per phase, e.g.: Quotation → *Return to client* / *Create & send
quote*; Awaiting Payment → *Payment received*; Production → *Schedule* / *Record a
print* / *Record result & inspect* / *Reprint needed* / *Complete production*;
Post-Processing → *Mark post-processing done*; Packaging → *Ready for collection*;
Delivery → *Confirm delivery*; Closeout → *Record feedback* / *Close order*.

New CSS needed: a progress-bar component (track + fill + label) and the event
timeline, with matching rules so `contract.test.js` (every `class:` has a rule)
stays green.

## Data model & migration
- `makeProject` gains `phase: 'quotation'`, `onHoldFrom: null`, and the
  `workflow` object above; `history` entries gain the typed shape.
- `migrateProject` maps the old `status` → `phase`: draft/quoted → quotation;
  accepted/invoiced → awaiting-payment; paid/in-production → production;
  complete → closeout; cancelled → cancelled; archived → closed. Existing
  `history` becomes the event log. Tested against a literal old blob.
- A derived `statusFromPhase(phase)` keeps the few legacy readers working;
  `analytics.committedLoad` moves to "production and beyond = committed" (a small
  change) rather than keying on the old `accepted` string.
- `PROJECT_STATUSES`/`PROJECT_PIPELINE`/`nextStatus`/`prevStatus` from last
  session are removed or reduced to the migration map, and `workflowPanel` is
  replaced by the phase-driven panel.

## Testing
- `tests/workflow.test.js` (new): phase transitions incl. Return-to-client,
  manual payment, the reprint loop, post-processing auto-skip, on-hold/resume,
  cancel; phase and overall progress from recorded data; the client report text;
  event logging on each transition.
- `records.test.js`: `migrateProject` old-status → phase mapping against a literal
  old blob; event-log shape.
- `contract.test.js` and the full suite stay green (new classes get CSS).

## File-by-file
- **new** `js/workflow.js` — phases, `workflowState`, `advance`, progress, client
  report, `logEvent`.
- `js/projects.js` — `phase`/`onHoldFrom`/`workflow` on `makeProject`; migration
  map; typed history; drop the old pipeline exports.
- `js/analytics.js` — `committedLoad` keys on phase.
- `js/ui/tools/projects.js` — replace `workflowPanel` with the phase-driven panel;
  event timeline; copy-client-update; wire actions to `advance()`.
- `css/components.css` — progress bar + timeline.
- `js/ui/tools/guide.js` — write up the six-phase workflow (standing rule).
- **new** `tests/workflow.test.js`; updates to `records.test.js`.

## Open question for review
- **Overall-progress weights**: the 15/5/35/10/10/15/10 split is a starting point.
  Happy to change it (e.g. make Production heavier, or weight by the value each
  phase represents to the customer) — tell me if you have a preference.
