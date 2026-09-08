# Backlog

Things to do later, not yet scheduled. Newest first.

## Features / ideas

- **Banking details on their own lines** — on the quote/invoice the banking
  details currently print on one line; put each part (bank, account name, account
  number, branch/branch code, reference) on its own line so they are easy to read
  and copy. (Raised 2026-09-08.)
- **Custom thank-you note on the invoice** — a place to add a custom thank-you
  message that prints on the invoice (editable per document, with a company-level
  default in Settings). Distinct from the packaging thank-you card. (Raised
  2026-09-08.)
- **Custom filament-roll labels → downloadable PDF (label-printer sizes)** — a
  company setting turns on making a custom label per roll of filament, each
  carrying that roll's specific id/code. Let the company choose the label size to
  match their label printer (a set of common sizes, plus a custom w×h). "Print
  spool labels" then generates a **downloadable PDF** sized to that label, to send
  to the label printer (today's spool labels are a browser print sheet — this adds
  a proper PDF at a chosen size). Allow selecting several rolls and generating
  **one PDF with all their labels**. Builds on the existing `buildSpoolLabels`
  sheet and pairs with the per-roll tracking item below (the id/code on the label
  is the roll's identity). (Raised 2026-09-07.)
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
- **Colour swatches on filament colours** — give each material/colour a colour
  code (a hex value) and show a small coloured square next to the colour name
  wherever a material is listed or picked: the Materials catalogue, the estimator
  and project filament/head pickers, the client form, spool labels, and slicer
  head rows. Would need a `colourHex` field on a material (with a sensible default
  and an editor/colour-picker in Catalogues → Materials), a migration to add it,
  and a small reusable swatch element. Consider a multi-colour/gradient material
  (e.g. silk rainbow) — maybe two stops or a "varies" marker. (Raised 2026-09-07.)

## How-to / guide additions

_Both of the previously-listed FAQ additions (internal-vs-customer pricing; team
sync vs "Save all") were written into the guide's FAQs on 2026-09-07._

- **Suppress/reword the "save a backup" reminder while team sync is connected** —
  the periodic backup nudge is redundant once sync auto-saves to the shared file;
  soften or hide it when a sync file is connected. (Raised 2026-09-07.)
