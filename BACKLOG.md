# Backlog

Things to do later, not yet scheduled. Newest first.

## Features / ideas

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
