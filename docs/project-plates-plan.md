# Plan — project side becomes build plates + expedited reconciliation

_Design agreed 2026-09-22. Estimate side is UNCHANGED; this only reshapes the
project (production) side._

## The separation
- **Estimate side** (main estimate, client portal, employee portal) = cost a part
  from geometry, WITHOUT slicing. Models, 3D view, auto-placement, per-part
  everything live here. Untouched.
- **Project side** = used alongside the real slicer. No models, no geometry, no
  auto-placement. A project is a set of **build plates**; you enter the slicer's
  real values per plate. The tool never re-derives what the slicer already knows.

## Model
`project.beds = [{ id, name, slots:[{ materialId, colourId }] (heads),
gramsPerHead:[g], minutes, post:{ magnets, nfc, inserts, resin, deburr, support...
as COUNTS }, printed, accepted }]`.
- New bed **copies the previous bed's loadout** (materials/colours); you change
  only what swapped, then enter grams per head + total time.
- **Time is always per bed.** Grams are per head (per colour), per bed.
- **Post-processing is per-bed quantities**, not per-part (the tool doesn't care
  which part gets the magnet — the cost of embedding N magnets is the same).
- **No per-part rejection.** Track `printed`/`accepted` per bed (scrap = cost
  spread over good parts). A **reprint is a new bed** (copy, keep the swap, enter
  its grams+time).
- Parts are NOT modelled on the project. Invoice itemisation comes from the
  **quote** (what the client ordered); a direct job with no quote is priced as one
  whole-job line.

## Pricing
- New engine path: **price a bed from real grams+time+loadout** — material =
  Σ(grams×price/head), machine = time×machine-hour, electricity from time, labour
  = the workflow (order/plate/job scopes), post-proc from bed quantities, scrap
  from printed/accepted. Project CTC = Σ beds.
- **True price** = project CTC × thirds (honours `internal`, already fixed).

## Two client paths (this scopes the reconciliation)
- **Standard (client waits):** slice → quote the REAL cost → client pays real.
  Fixed, binding quote. **No delta, no reconciliation.**
- **Expedited (pay now):** client pays the estimate + a company **buffer %**
  (setting; check vs existing `customerPortal.quoteBuffer`). Disclaimed as an
  estimate that may adjust. This is the ONLY path with reconciliation.

## Reconciliation (expedited only) — a prompt, never silent
Project shows `paid R80 · true R100 · Δ R20` and the company picks:
- **Under-recovered** (true > paid), above a **tolerance band** → adjustment
  invoice for the difference. Below tolerance → absorb.
- **Over-recovered** (true < paid) → **full** surplus becomes client credit.
- Already-paid → second invoice for the difference; not-yet-paid → invoice
  re-prices to true.

## Per-customer credit ledger (±)
- `customer.credit` running balance + ledger entries.
- Surplus → **+credit**; an unrecovered shortfall the company absorbed-as-owed →
  **−credit**. Next order settles against the balance first (a client owed credit
  spends it; a client who underpaid has it netted before any new voucher).
- **Auto-apply or manual is a company setting.**
- **Expiry (company setting):** each ledger entry expires this long after it was
  created; on expiry it is absorbed/zeroed — **both** positive (client loses the
  voucher) and negative (company writes off the shortfall). A client who orders
  once every few years carries nothing forward. Applying credit ignores expired
  entries.

## Stages
1. **Plates:** bed model + bed pricing engine path + bed editor UI (copy-previous,
   grams/head, time, post-proc counts, printed/accepted); strip model upload / 3D
   / auto-placement / per-part slicer from the project side; reprint = add bed.
2. **True price + expedited reconciliation:** buffer % setting, disclaimer, the
   reconciliation prompt (charge / credit / absorb), tolerance band.
3. **Credit ledger:** per-customer ± balance, ledger, auto/manual apply, expiry.

## Open implementation details
- Is the expedited buffer the existing `customerPortal.quoteBuffer` or a new
  expedited-only knob? Resolve at stage 2.
- Migration: little/no real data yet — existing projects can seed one bed from
  their per-part slicer figures, or start fresh. Keep light.
- Dashboard/analytics currently read per-part attempts → repoint at bed
  printed/accepted + bed cost.
