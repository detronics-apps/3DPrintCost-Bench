# Changelog

## 1.0.33 — Tighter bed packing, mix balancing, fit-intent tidy-ups (2026-09-11)

- **Bed layout packs tighter** — a tall part no longer wastes the space beside it, so
  parts fill the beds they're on instead of spilling onto an extra, near-empty bed.
- **Material mix: the first colour is the balancer** — set the 2nd or 3rd colour and
  the first adjusts to keep 100%, leaving the others where you put them.
- **Estimate parts can all be collapsed** — click the open part's header to close it;
  only one opens at a time, but none has to be open.
- **"Must fit / mate" is now tied to the Fit intent** — it only appears when Fit is
  chosen, ticks on automatically, and can still be unticked (estimate portal + project).
- **Client portal: "Printer and colours" now sits above the parts** (pick colours,
  then the parts) — matching the internal estimator.

## 1.0.32 — Measured resin rate; shrinkage adds a little cost (2026-09-11)

- **Resin coat now uses a measured rate** — 0.088 g/cm² (from 0.81 g over a 27 × 34 mm
  tag), replacing the old placeholder; existing setups on the placeholder are corrected.
- **Shrinkage compensation now nudges cost up a little** on the profiles that use it
  (Function, Fit), reflecting the extra slicing effort to adjust the model.

## 1.0.31 — Commercial categories as percentages; profile fixes (2026-09-11)

- **Categories now use a percentage, 100% = baseline** (110% adds 10%, 90% takes 10%
  off, 200% doubles it) instead of the "weight 10" that read confusingly. Each row
  carries a tag: **"of category"** (a calculated category — the % is of its own
  amount) or **"of total"** (an added category — the % is of the whole order).
- **Only added categories can be deleted**; the calculated ones are part of the model
  and stay.
- **Fixed the Aesthetics label being cut off** on the print-intent radar.
- **The Fit profile is now correctly the dearest** — its calibration/reprint pass was
  missing on older saved profiles and is filled back in, so its Cost score drops.

## 1.0.30 — Beds & layout: 3-D block pushed right, heading at its left edge (2026-09-11)

- The 3-D view now sits as a block on the right of the panel, with the **"In 3D"
  heading at the block's own top-left edge** (over the left of the isometric view),
  still on the same line as "Beds & layout".

## 1.0.29 — Beds & layout: In 3D heading right, plates left, cleaner labels (2026-09-11)

- **"In 3D" now sits on the same line as "Beds & layout"**, right-aligned, with the
  3-D view right-aligned beneath it and the top-down plates on the left.
- **The legend drops the file name** — it reads "Part 1 ×1", "Part 2 ×4". The full
  model name moves to the **Part breakdown** table, which now leads with a part-number
  column (Part 1, Part 2, …) followed by the Model name.

## 1.0.28 — Commercial categories: edit in Settings, add/delete any (2026-09-11)

- **The category inputs now live in Settings → Pricing** (Commercial categories); the
  estimate panel just *shows* where the money goes. Every category — built-in or your
  own — can now be **deleted**, and you can add new ones.
- **Added categories are a % of the order total** (there is no calculated amount behind
  them), while the calculated categories keep the weight dial. The part-selector chips
  on the estimate now read "Part 1", "Part 2", not the model file name.

## 1.0.27 — Commercial categories: see and dial where the money goes (2026-09-11)

- **"Where the money in this order goes" replaces the old commercial-share panel.**
  It now lists every category (material, machine, labour, profit, marketing, …) with
  the amount already worked out for it and a **weight you can dial**: 10 charges it
  as calculated, 11 adds 10% of that category to the client’s price, 9 takes 10% off.
  Profit is just another category, so its weight only moves profit. The confusing
  "Already charged" and "share of 100%" columns are gone.
- **Add your own categories** for anything you want money set aside for (charged as a
  % of production cost) — on the estimate panel or in Settings → Commercial categories.
- At the shipped weights (all 10) the price is exactly what it was before — the
  weights only move it when you change one.

## 1.0.26 — Print-intent profiles reworked, engineering-based scores (2026-09-11)

- **The print-intent radar is now calculated, not hand-set**, and gains a fifth
  axis, **Aesthetics**. Strength is a real moment-of-inertia calculation (outer
  walls count for far more than infill, and it is non-linear), Precision rewards
  shrinkage/calibration and fine layers but is cut hard by fuzzy skin, and each
  profile is a clear winner on one axis (Extra Strong → strength, Fit → precision,
  Visual → aesthetics, Display → speed & cost). Every coefficient is company-editable.
- **Material is now purely a calculation** — wall shell + solid skin + infill,
  bounded by the part’s solid volume — so a profile can never ask for more plastic
  than the part holds. The old "the factors ask for more than its solid volume"
  message is gone for good.
- **Print intent adjusts time, never material.** Finish work (ironing, fuzzy skin),
  adaptive layers and an **iterative calibration pass** (which makes **Fit** the
  slowest, dearest profile) stretch the quoted print time. A new per-profile **time
  factor** in Settings lets the company nudge that for their own machines.
- **No-model parts assume 60% of their space claim** (was 35%), adjustable in
  Settings → Estimator assumptions.
- **The 3-D bed view** heading is renamed **In 3D**, moved to the top and
  left-aligned beside the plates.
- The How-to tab explains the whole print-intent setup (profiles, the radar,
  material vs. time, and how to tune it).

## 1.0.25 — Bigger 3-D view, shown solid volume (2026-09-11)

- **The 3-D view is much larger** and fills the space beside the top-down plates
  (which now take only the room they need), with the "In 3-D" heading in the same
  size and style as the "Beds & layout" heading.
- **The estimated solid volume is shown.** With no model loaded, the Solid volume
  field explains the figure it uses — 35% of the length × width × height box — with
  the actual number, instead of a bare 0. Type a value to override it.

## 1.0.24 — Bed layout: flag parts that don't fit, simpler labels (2026-09-11)

- **Parts that don't fit turn red.** A part too tall for the printer is drawn red on
  both the top-down plan and the 3-D view, and its legend entry goes red with the
  reason ("too tall" / "too big for the bed"). The warning above the notes now has a
  matching visual on the actual part.
- **The 3-D cage is the real printer.** The dashed build-volume outline is always the
  machine's true size, so a part taller than the printer visibly rises past it.
- **Simpler labels.** Boxes on the bed show the short "Part 1" / "Part 2" (the full
  model name overflowed and swamped the picture); the full name stays in the legend.
  The part editor heading is just "Part 1" / "Part 2" too — the name is in the field
  right below it.

## 1.0.23 — 3-D bed: solid parts, bigger and centred (2026-09-11)

- **Parts render solid, the right way round.** The 3-D view was drawing each part's
  far faces, so the boxes looked inside-out; it now draws the near faces (the two
  you actually see) with the top, so every part reads as a solid block.
- **Bigger and centred.** The view no longer scales to a tall, mostly-empty
  build-volume cage — the cage now hugs the parts, and the whole drawing is centred
  and fills the frame, so there's far less empty white space.

## 1.0.22 — Estimate: money breakdown moved up, table renamed (2026-09-11)

- **The whole-bed money breakdown (production, part price, invoice) moved up** to
  sit right under the notes and above the part table, so the bed's totals read
  first, then the split by part.
- **"Parts on this bed" is now "Part breakdown."**

## 1.0.21 — Bed layout polish and per-part thirds bar (2026-09-11)

- **The 3-D bed reads cleaner.** The isometric view now shows the coloured blocks
  only — no part names cluttering the boxes. The purge tower is only as tall as the
  tallest part on that bed (not a full-height spike), and the view is rotated so the
  tower sits on the left, matching the top-left corner of the top-down plan.
- **No tower on a single-colour bed.** A plate only shows a purge tower when the
  parts on it actually run more than one colour — so a part set to 100% of one
  filament, alone on its plate, no longer draws a tower it never prints.
- **Colours first, then parts (estimate).** The "Printer and loaded filament" panel
  now sits above the parts, so you load the bed and then fill in each part without
  scrolling back up. (The project already worked this way.)
- **The per-part thirds bar moved up** to sit directly under the Part 1 / Part 2
  selector, so it's clear it belongs to the part you picked and updates as you
  switch parts.

## 1.0.20 — Dashboard: hardware used most (2026-09-11)

- **"Hardware used most" on the Dashboard** — a new panel counts every component
  fitted into accepted parts, so you can see what to keep stocked. (Most-used
  filament and overall profit/margin were already there.)

## 1.0.19 — How-to search understands everyday words (2026-09-11)

- **Search the How-to in your own words** — the guide search now maps everyday
  phrases to the app's terms, so "local save" or "cloud" finds Team sync, "ran out
  of filament" finds Reorder points, "client form" finds the portal, and so on. If
  you don't know what the app calls something, search what you'd call it.

## 1.0.18 — Inventory reorders section (2026-09-11)

- **A Reorders section at the bottom of Inventory** — every stock line at or below
  its reorder point is listed with two actions: **Reordered** (books the purchase
  and restocks it to twice the reorder point) and **Reject** (clears it from the
  list until it drops again). The low-stock alerts at the top are now one
  dismissible line instead of a stack of banners. (Reorder points were already
  editable per line.)

## 1.0.17 — Adaptive layers (2026-09-11)

- **Adaptive layers print setting** — tick it on a part (Advanced/Expert, on the
  estimate and the project) for finer layers where the surface curves: a better
  finish that adds about 15% to the print time (the plastic is unchanged). The
  uplift is editable in Expert factor settings.

## 1.0.16 — Delivery names the calculated box and courier (2026-09-11)

- **The box the parts fit in is named, not "cheapest that fits"** — the packaging
  option now reads "Automatic — {the box} (the parts fit in this)" and a line states
  the calculated box and its dimensions, so you can see which box was chosen. The
  delivery option likewise names the cheapest courier that carries that parcel. You
  can still override either.

## 1.0.15 — Notes fold into one dismissible line (2026-09-11)

- **The stack of notes at the top is now one expandable line** — instead of a wall
  of banners, the estimate and project show a single "N notes" line you expand to
  read them, each with a × to dismiss it (dismissals stick until the note changes).
  A serious warning (a part that will not fit) still shows on its own, always
  visible — that one is not something to fold away.

## 1.0.14 — Estimate parts collapse to an accordion (2026-09-11)

- **One part open at a time on the estimate** — with several parts, each collapses
  to a clickable header (Part N — name, with its Remove button); click one to expand
  it, which closes the others. No more scrolling through three open parts to find
  where one ends and the next begins. Adding a part opens the new one.

## 1.0.13 — Bed layout: 3-D view beside the top-down, purge tower, click-to-select (2026-09-11)

- **Top-down and isometric views of the SAME bed** — the "Beds & layout" picture
  now shows the top-down plan and a 3-D isometric view of the same parts side by
  side, so the two never disagree. Click a bed (when a job needs several plates) to
  select it — it highlights, and the 3-D view shows that plate.
- **Purge tower on the bed** — a multi-colour bed now books a purge tower in the
  back corner of every plate, shown on both views (a single-colour bed needs none).
- **Removed the old print-height / orientation render** — the separate build-volume
  cage and the Y-up/X-up orientation strip are gone; the two bed views replace them.

## 1.0.12 — Fix: project parts used the wrong printer in two places (2026-09-10)

- **The "Multi-colour (by height)" section and a recorded print now use the
  project's printer** — both were reading the part's own (default Bambu X1E) printer
  instead of the shared project bed, so on a Snapmaker project the colour section
  said "Bambu Lab X1E loads 4" and a booked print was logged against the X1E. Both
  now follow the project bed (or the part's own printer when it's an override).

## 1.0.11 — Stock movements: the reason sets the sign (2026-09-10)

- **Record a movement by reason, not by remembering a minus** — you now enter a
  plain quantity and the reason decides the direction: Purchased and Returned to
  stock add; Used in production and Scrapped remove. "Manual adjustment" is gone
  (old adjustment entries still display correctly).

## 1.0.10 — Workflow-ordered navigation (2026-09-10)

- **The top tabs now read the workflow left to right** — Estimate | Projects ·
  Schedule | Dashboard · Quotes · Inventory | Catalogues · Settings | How to use,
  with a quiet hairline separator between each group (entry point · production ·
  managing the work · configuration · help). No new colours, just clearer grouping.

## 1.0.9 — Mixed-part bed layout in all three places (2026-09-10)

- **See different parts positioned together on one plate** — a new top-down "Beds
  & layout" picture places every part of a job on the bed, colour-coded and
  labelled, spilling onto more plates as each fills, so you can see which parts
  share which plate and roughly where they sit. It shows on the **estimate**, the
  **project** and the **customer portal** — the same view for you and the client.
  It’s an approximate shelf-packing layout (a floor, not a slicer nest), and says so.

## 1.0.8 — Calmer empirical-factor note (2026-09-10)

- **The “factor asks for more than the solid volume” message is no longer a
  warning** — it was alarming on ordinary parts, when the quote never used that
  figure in the first place: the geometric estimate (built from the part’s own
  settings, so it can never exceed solid) is what prices the part. The note is now
  a calm, reference-only line that says so, and no longer shows as an order warning.

## 1.0.7 — Project shared bed: one printer for the whole job (2026-09-10)

- **The printer and loaded filament are now a project-level choice** — set once
  under the project (Printer & loaded filament), and every part prints on that one
  shared bed. Building an assembly of many parts no longer means re-picking the
  printer and colours for each.
- **Shared-bed pricing on projects** — parts on the shared bed are now packed onto
  the fewest plates, share the purge tower and plate changeovers, split by colour
  for the machine’s head count, and the plate count is worked out — exactly as the
  estimate bed does. A new **Beds & layout** panel shows which parts sit on which
  bed and draws the selected part on its plate in the build volume.
- **Move one part to a different printer** — a per-part "Print on a different
  printer" tick-box (default off) sends the outlier onto its own machine, priced
  there and off the shared bed. It’s still one invoice.
- Existing projects migrate automatically: the first part’s printer becomes the
  project’s, and any part that was on a different printer is flagged as an override,
  so nothing silently changes machine.

## 1.0.6 — General allowance = its named categories (2026-09-10)

- **The general allowance is now the sum of what it covers** — marketing, admin,
  R&D and storage, each a % of the production cost, set in Settings → Cost to
  Company (and on the estimate’s Allowances panel). The old single "general
  allowance %" is replaced by these four; the "How this works → Cost to Company"
  panel itemises them so you can see the allowance add up. No price moves on
  upgrade: your existing allowance total is split across the four in proportion and
  preserved exactly — adjust them from there.

## 1.0.5 — Project page: parts, layout, colour-by-height (2026-09-10)

- **Add another part from the part editor** — the part editor’s action row now has
  an "Add another part" button (opening the new part), so you can build a
  multi-part project without hunting for the "Add a part" button in the main Parts
  panel. (The main-panel button was always there — this makes it findable from
  where you work.)
- **Model upload moved to the top of the part editor** — you load the model first,
  then name it, set the quantity and the print intent from what it actually is.
- **Colour-change-by-height on a project part** — the estimate tool’s per-layer
  colour bands are now on project parts too (Advanced/Expert), with the same
  hand-swap warning when a part needs more colours than the machine loads.
- **Removed the per-colour percentage split on projects** — a project is priced
  from the slicer’s exact grams per head, so the estimate-only "10% white / 90%
  yellow" split added nothing there and is gone; the colours a part uses are set as
  bands up its height instead.

## 1.0.4 — Pricing-model clarity (2026-09-10)

- **Commercial-share panel reads honestly** — in "Where the commercial share
  goes", the **Weight** is now a plain score (no `%`), the **Share** is that
  weight as its portion of 100% (the shares add up to 100%), and a new **Already
  charged** column shows the real direct cost for each bucket that names one
  (machine, labour, packaging, …) so you can see it against the notional share.
  No pricing change — this is the display the confusing "weights add to 152%"
  made unreadable.
- **"How this works" panels now give the correction** — every panel that names a
  "commonly got wrong" now follows it with a green "How it actually works" line,
  so you never leave with only the misconception.
- **Company-internal orders drop the allowances** — a project whose order type is
  *internal — company* is now priced at the bare direct cost: the rejection
  allowance and the general allowance fall away (an internal expense is not padded
  for scrap risk or overhead). Employee-internal still keeps both, since it is a
  billed job at cost.

## 1.0.3 — Fix: logo and electricity tariff no longer reset (2026-09-10)

- **Company logo and electricity tariff now persist** — both were silently reset
  on every load (and every team-sync round-trip): the settings deep-merge hit the
  `typeof null === 'object'` trap, so a field whose default is `null` (the logo and
  the alternative-tariff id) discarded the stored value and fell back to the
  default. `mergeInto` now returns the stored value when the default is null. If
  yours were already lost, set them once more and they will stick.

## 1.0.2 — Project part editor: parity with the estimators (2026-09-10)

- **Every estimator control on a project part** — the project part editor now
  exposes the same Advanced/Expert per-part levers the Estimate tool and client
  form offer: the print-setting overrides (infill %, infill pattern, wall loops,
  layer height, shrinkage, angle optimisation, ironing, fuzzy skin via
  `settingOverrides`), a labour-complexity multiplier, a parts-per-plate override,
  an other-direct-cost per part, and the estimate-method selector on the slicer
  figures. All mode-gated (hidden in Simple) exactly as the estimator gates them.
  The fields already rode into a project from an estimate; this adds their
  editors, so nothing you can set on an estimate is unavailable on the project.

## 1.0.1 — Quote & invoice document polish (2026-09-08)

- **Banking details on their own lines** — each banking detail (bank, account
  name, account number, branch code, reference) is typed on its own line in
  Settings → Company and now prints on its own line on the quote and invoice, so
  a client can read and copy them instead of them running together.
- **Custom thank-you note on the invoice** — a short thank-you message prints at
  the foot of an invoice. Set the company default in Settings → Company; edit it
  per invoice from Quotes & invoices. Distinct from the packaging thank-you card.

## 1.0.0 — First public release (2026-09-04)

The app ships as **3DPrintCost Bench**: costing, quoting, production scheduling
and invoicing for 3D-printed parts, running entirely in the browser with no
backend, no build step and no network once loaded.

Highlights over the development series below (which are pre-1.0 history):

- **Pricing** — rule of thirds with a growth split; per-plate colour-change
  amortisation; labour as the whole workflow; shared-bed packing.
- **Post-processing** — a per-part dropdown: support removal, resin coat (priced
  by top area with curing), deburring (opt-in), NFC coding, and fitting
  after-print hardware.
- **Hardware stages** — components fitted during the print (embedded) or after
  it (shipped loose, or assembled as a finished product).
- **Colour by height** — per-part Z-height bands; colours beyond the machine's
  heads become scheduled hand swaps, priced as labour + machine wait, and kept
  off overnight runs.
- **Machine economics** — machine-hour cost from real spend; payback hours vs
  expected life; salary-based labour rate.
- **Production** — scheduler with lead times, overnight (HIRA) priority and
  attended-only handling; inventory with spool labels.
- **Client portal** — a browser-only estimate form at full parity with the
  internal estimator, returning a one-tap request.
- **Data** — everything in the browser; Save all / Restore, and optional
  Drive-file team sync. Backups upgrade cleanly across versions.

## 1.6.0 (pre-release development)

### Three fuel tanks, not three equal thirds
The rule of thirds is a guideline, and the app now treats it as one. A part has
three tanks to fill; one may come out over and another under, and that is fine.

    Tank 1  Cost to Company - everything the company must spend to make the
            part, EXCEPT labour. Labour is left out because an employee is
            usually paid by the month whether or not this part exists.

    Tank 2  Labour + growth - nominally the same size as tank one. If the work
            comes to less, the rest of the tank is growth: marketing, R&D,
            administration. If the work comes to MORE, the tank is simply
            bigger. You keep the larger number.

    Tank 3  Profit + capital - half of the first two together, because those two
            are two thirds and this is the third one.

The property worth knowing: when the work lands under a third this reduces to
exactly CTC x 3, the classic rule. When it runs over, the price follows the work
instead of pretending the work was free. Both are pinned by tests.

The worked case from the screen: CTC R22.55, work R40.36. Tank two would have
been R22.55 but the work came to R40.36, so the tank is that big and there is no
growth in it. Tank three is (22.55 + 40.36) / 2 = R31.45. Part price R94.36 -
down from R108.00 under the previous formula, and from R185.60 before labour
moved out of the Cost to Company at all.

### The numbers on screen now reconcile
The three big tiles are the WHOLE ORDER; the diagrams under them are ONE PART.
Nothing said so, which made R108 and R972 look irreconcilable when they were
9 x R108. Every figure now states what it is counting:

- the tiles say "for all 9 parts", and the part-price tile adds "R94.36 each"
- the money diagram's title says "for all 9 parts"
- the thirds diagram says "One part:"
- the breakdown ends with "Part price, each" and then "x 9 parts"

### The diagram stopped making you do the matching
It carried one shared key for all three bars - fifteen swatches at the bottom,
and the reader matching colours back up to segments by eye. Each bar now carries
only its own four to eight entries, with amounts, directly underneath it. There
is nothing to cross-reference.

Pie charts were considered and turned down: three pies of equal size would say
the three totals are equal, when the entire point of the picture is that the
invoice is four times the production cost and you can see it at a glance. The
one scale stays; the matching problem is gone.

## 1.5.0

### Labour is recovered once, not tripled
This is the change that makes parts stop looking absurd. Labour used to sit
inside the Cost to Company, and the rule of thirds then multiplied it by three —
so an hour of admin on a one-off part was charged three times over.

Labour now has its own place in the price. The Cost to Company is the PHYSICAL
cost of the part — material, machine, electricity, hardware, scrap — and only
that is multiplied. The work is recovered beside it, exactly once.

    part price = CTC + labour + (CTC x growth share) + (CTC x profit share)

Measured on a real part: **R1 807.40 before, R972.01 after** — 46% cheaper for
the same job. Where labour sits is a setting (Settings -> Pricing), the old
reading is still available, and the panel shows both worked through with your
own shares so the consequence is visible where the choice is made. A growth
uplift on recovered labour is there too, and defaults to zero: the work is
recovered at what it cost.

"Below cost" now means below CTC PLUS labour, or the warning would never fire on
the jobs where it matters most.

### Has the machine paid for itself?
A new panel on the Dashboard, per printer:

- what it has to earn back — purchase less residual, plus the maintenance and
  parts it has cost since
- what it has earned — the depreciation, maintenance and parts charged in its
  hourly rate for the hours it actually ran, plus its share of the profit its
  work made, split between machines by hours
- how far along it is, as a bar that keeps going past 100%, because a machine
  that has earned three times its cost is the most interesting thing on the page
- what it has made BEYOND its own cost, which is what buys the next one

A printer is credited only with money that was charged FOR THE MACHINE. Not the
plastic, not the labour, not the shipping: none of that was ever going to buy a
printer. Failed prints count — the machine ran and the money was spent.

### A colour change costs machine time
Every filament change stops the machine, and that is machine time: it goes into
the print duration, and so into the machine cost and the electricity. Never into
labour — nobody is standing there.

Shipped: 6 s on the Snapmaker (put one head down, pick another up, the next
filament already loaded and hot) and 25 s on the Bambu (retract, cut, load,
purge). Both editable per printer, and both starting values to be timed against
your own machine.

### Fixed
- **Automatic changes were billing a person.** A tool change and an AMS purge
  cost machine time and plastic; only a change somebody actually makes bills
  labour now.
- **The rule-of-thirds diagram collided with itself.** The blocks are
  proportional, which was safe with three roughly equal thirds and stopped being
  safe the moment labour became a fourth block that can dominate the bar. A
  labour-heavy part squeezed the other three to a few pixels and their labels
  ran into each other and off the canvas. Labels now sit under their blocks only
  while every block is wide enough to hold one, and move to a legend otherwise.
  Checked at six ratios including all-labour and all-zero.
- `assertSeparation` caught the pricing change itself: the price is now the sum
  of four components rather than three, and its invariant said so before
  anything shipped.

## 1.4.0

### The purge tower is a real object on the plate
A machine that changes filament on its own has to put the purged material
somewhere, and that somewhere is a tower printed beside the part, as tall as the
part is. It now exists in the model, and it matters twice:

- **It takes bed space.** 30 × 30 mm by default, editable in
  Settings → Estimator. Fewer parts fit on a plate, so a batch needs more plates.
- **It is where the purge goes** — not a second helping of plastic on top of it.
  Counting the tower's own volume as well as the purge would charge the same
  material twice.

A pause-and-change machine has no tower: the person purges into a bin. A
single-colour machine has nothing to purge.

Measured on nine 70 × 70 × 40 mm parts on the Bambu: the tower costs one slot,
so 8 fit per run instead of 9, so nine parts need two runs instead of one.

### Plates, and what a second one costs
- The number of plates a batch needs is worked out from what fits, tower
  included, and is shown on the estimate: "8 per plate · 2 runs".
- A new labour scope, **per extra plate**, charges a 3-minute changeover from
  the second plate onwards — coming back to the machine, clearing the finished
  bed, starting the next run. One plate costs nothing extra, which is the point.
- Editable like every other labour operation, in Settings → Labour.

### Fixed
- **The purge default was an order of magnitude too high.** It was 8 g per
  colour change; a slicer's flush volume per transition is around 800 mm³, which
  is about 1 g of PLA. On a 40 mm two-colour part that was the difference
  between 240 g of waste per part and 31 g. Purge is now measured as a VOLUME,
  the way a slicer states it, and converted to weight against whichever plastic
  is actually being flushed.

Measured after the fix, nine 70 × 70 × 40 mm parts, one colour against two:

| | Material each | Per plate | Cost to Company |
|---|---|---|---|
| One colour | 33.8 g | 9, one run | R710.89 |
| Bambu, two colours | 64.5 g | 8, two runs | R912.91 |
| Snapmaker, two colours | 40.2 g | 8, two runs | R788.13 |

## 1.3.0

### Four capabilities, not three
A printer's filament capability now has four settings, chosen in
Catalogues → Printers:

| | What it means |
|---|---|
| **One colour only** | One plastic, one colour, no change possible. The default, and what the Ender-3 ships as. |
| **Pause and change by hand** | The same one extruder, but the print pauses and somebody swaps the spool. Any colour, and at a push any plastic. |
| **Multi-colour** | Several spools, one hotend. Colours vary; the plastic cannot. |
| **Multi-material** | Independent heads, each with its own hotend. Both vary. |

Pause-and-change is limited by how many swaps somebody will actually do
(`maxColours`), not by what is loaded at once — only one ever is. Swapping
between different plastics is allowed, because it works, with a warning that the
layer where they meet is the weakest in the part.

### The purge model, corrected
The three mechanisms waste plastic in genuinely different amounts, and treating
them as "a purge per change" got two of the three badly wrong:

- **Multi-colour (AMS-style)** — one hotend has to be emptied of the last colour
  on **every layer that changes**, so the waste scales with height. On a tall
  two-colour part it reached **145.5 g**.
- **Multi-material (toolchanger)** — each head keeps its own filament loaded and
  hot. It primes **once, at the start**, and a change after that is a tool swap:
  time, and no plastic. The same part: **7.5 g**. Height changes it not at all.
- **Pause and change** — one purge per swap, and a swap on every part, so it
  scales with quantity.

Measured on the same part, loading a second colour costs **+R62.39** on the
Bambu, **+R13.86** on the Ender by hand, and **+R2.81** on the Snapmaker. That
ordering is a result of the three mechanisms, not a ranking anybody typed in.

Both figures are editable in Settings → Estimator, alongside the assumption
about what fraction of layers contain a transition — which only the slicer
really knows, and which is why pasting the slicer's own numbers in matters more
on a multi-colour print than anywhere else.

### Fixed
- **Automatic colour changes were charging human labour.** A tool change and an
  AMS purge cost machine time and plastic; nobody is standing at the machine.
  Only a change somebody actually makes bills labour now.
- **Loading a spool could change nothing.** With an empty mix the whole part went
  to the first spool, so adding a second did nothing at all. An unset mix is now
  an even split across what is loaded — and where a mix had already been typed,
  the *action* of loading seeds the new spool an even share and scales the
  others to make room, keeping their proportions. A button that does nothing
  reads as a broken button.

## 1.2.0

### A printer says what it can print at once
- Every printer carries a **filament capability**, set in Catalogues → Printers:
  *one filament at a time*, *multi-colour*, or *multi-material*. It is a
  property of the machine, not a preference, and it decides what the app is
  allowed to offer.
- Shipped as: Ender-3 single, Bambu X1E multi-colour, Snapmaker U1
  multi-material.
- **Multi-material** gives each head its own plastic AND its own colour — the
  Snapmaker can print PLA in one head and filled nylon in another, which is what
  independent hotends are for.
- **Multi-colour** offers the plastic once, above the list, and a colour per
  slot. One hotend has one temperature, so it cannot honour two plastics, and
  offering the choice would be a lie. A slot list that arrives with two plastics
  is brought into line and the reader is told.
- **Single** offers one spool and no button to add another.

### How much of a part is each filament
- With more than one spool loaded, each part says what percentage of itself is
  each of them. The split is **by volume, then converted to grams**: half the
  volume in PLA and half in filled nylon is 5.8 g and 5.1 g, not half the weight
  each. Splitting grams instead is a quiet error nobody ever finds.
- Each filament is costed at its own price. One average price across two
  plastics is wrong by whatever the difference between them is.
- A split that does not add to 100% is scaled in the proportion typed — and the
  running total is shown, and a warning says what happened. A split that does
  not add up is a typo, not a modelling choice, and pricing 87% of a part in
  silence is the worst available answer.
- The cost breakdown lists every filament: share, volume, weight, price per gram
  and cost.

### A colour change costs what it actually costs
The three machines pay in genuinely different currencies, and the app no longer
flattens them:
- **multi-material** — a tool change. Time, no purge: the other head was already
  hot and already loaded.
- **multi-colour** — a purge. One hotend has to be emptied of the last colour,
  and that plastic is waste.
- **single** — a person. The machine stops and somebody swaps the spool, once
  per extra colour per part. Deferred as agreed: the app holds a single-filament
  machine to one spool rather than costing the manual changeover.

### Fixed
- **The version in the footer was right and the page was stale.** A new
  **Reload the app** control in the footer fetches every file again, ignoring the
  browser cache, and reloads. This app has no build step, so its files are served
  under fixed names and a browser will happily keep an old module for a long
  time — the most expensive failure mode here is debugging something that was
  fixed and simply not delivered. The list of files comes from what the page
  actually loaded, so it cannot fall behind the code.
- **A newly shipped field could never reach an existing workshop.** The entry
  top-up added missing catalogue entries but not missing keys on entries already
  there, so a printer stored before filament capability existed had no
  `colourMode` and every machine read as single-filament. The feature worked for
  a new user and for nobody else. Shipped values now fill gaps on stored entries;
  the user's own values always win.

## 1.1.0

### Material and colour are two choices
- Everywhere a material is picked — the estimator, a project's part and the
  customer form — you now choose the plastic and then the colour. PLA, then
  White. One builder does all three, so they cannot drift apart.
- A combination you do not stock comes back as nothing rather than as another
  colour. Quoting White and printing Red because White was missing is exactly
  the silent substitution this app exists to avoid.
- Switching plastic keeps the colour when the new plastic has it: PLA White to
  PETG White, not PETG Black. Where it cannot, it moves and says so.
- A colour you have not bought can be added in one click, priced from the plain
  spool of the same plastic and marked as an estimate until you enter what you
  actually paid.
- The catalogue grew from 11 spools to 34 — ten PLA colours, seven PETG, and
  what the other plastics are actually sold in. Generic filament costs the same
  whatever colour it is, so no price was invented; specialty finishes are not
  shipped, because their prices vary by brand.
- Catalogue entries are generated from a table of plastic × colour, and every id
  the app shipped before is unchanged, so nothing saved before this release is
  orphaned. A test pins that.
- The customer form shows the colour and the price; the density, nozzle
  temperature and price per gram stay on the internal screens.

### Fixed
- A workshop set up before this release would never have seen the new colours:
  stored catalogues merge wholesale and the user's copy wins, so nothing the app
  ships afterwards could ever reach them. Newly shipped entries are now added on
  migration. Nothing in this app deletes a catalogue entry — the editor archives,
  which leaves it in the list — so an absent id was never seen, and adding it
  cannot resurrect something somebody removed.

## 1.0.0

First working version.

### The calculation engine
- One engine prices everything: the estimator, projects, the printer comparison,
  quotes and invoices all call `calculateOrder`. Nothing else prices anything.
- The chain from section 41 of the specification, in order: model, print intent,
  settings, printer, material usage, machine time, electricity, labour, hardware,
  scrap, CTC allowance, Cost to Company, rule of thirds, demand, discount,
  packaging, shipping, extras, final invoice.
- Shipping, packaging and fulfilment extras can never enter the Cost to Company
  or the thirds. `assertSeparation` checks it at runtime and the tests prove it.
- The company's allocation percentages divide the commercial share; they are
  never added to a price. A bucket that names a cost already charged directly is
  flagged rather than silently double-counted.
- Machine-hour cost is derived from what the machine cost and how long it will
  last. The Ender/Snapmaker/Bambu ordering is a result: raising the Ender's
  purchase price moves it, because no ranking is stored anywhere.
- Electricity is charged on its own line and is deliberately not in the machine
  rate, so it cannot be charged twice.
- Scrap is priced as attempts per accepted part, not as a flat uplift: 10%
  rejection costs 11.1% more, not 10%.
- Demand moves the commercial and profit shares only, so a discount can never
  take a part below what it cost to make.

### Model analysis
- STL (binary and ASCII), OBJ and 3MF, read in the page and never uploaded.
- 3MF is opened by reading the ZIP central directory and inflating with the
  platform's own `DecompressionStream`, so it needs no library.
- Volume, surface area, bounding box, separate bodies, watertightness, overhang
  area and a support estimate. An open mesh is reported rather than measured as
  if it were closed.

### Estimation
- The evidence hierarchy of section 6: actual production, slicer estimate,
  calibrated estimate, empirical factors, geometric approximation — and the app
  always says which one it used.
- The published factor tables are shipped verbatim and shown, but held at the
  part's own solid volume, because their product exceeds what a part can contain.
  See the README's accuracy note.
- Corrections are learned from finished jobs as a median, applied only once
  there is enough evidence, and never applied to a document already issued.

### The rest
- Projects with parts, revisions, production records and failed-print causes.
- Quotes and invoices as immutable snapshots that keep the assumptions they were
  priced under, with the drift against today's settings shown.
- Inventory as a fold over a movement log, booked out automatically by production.
- A dashboard with revenue, margin, rejection rates, capacity and the
  estimate-versus-actual comparison.
- SVG, PNG and CSV export, a share link in the URL fragment, and a printable
  sheet that carries nothing internal.

### The customer form
- `quote.html`, a separate page with no chrome and no internal figures. It calls
  the same `calculateOrder` as internal quoting, and a test asserts the two agree
  to the cent — a second pricing path that drifts is how a customer ends up
  quoted one number and invoiced another.
- Configured from Settings, handed out as a link whose URL fragment carries the
  options and the pricing settings. Fragments are never transmitted, and the
  customer's model is measured in their own browser.
- The link necessarily contains the cost model, because pricing has to happen
  somewhere and there is no server. The company is told so in a warning beside
  the button rather than left to assume otherwise. What the link does NOT carry
  is everything pricing does not need: customers, projects, numbering, terms,
  registration and VAT numbers.

### Fixed while building
- The caption lines under the build-volume diagram overlapped: an 11px font
  renders about 15px tall, and the stride was 14. Measured rather than assumed.
- The mode chips lived in the header and were built once, so they reported the
  detail level as it was at page load while the content showed something else.
  The header is now rebuilt with everything else, and the chips moved to the
  workspace bar — at 375px the header could not hold them and the brand too.
- `migrateSettings` checked an unknown country id with `findCountry`, which
  always answers with something, so the repair was unreachable and an invalid id
  survived.
- `nextRevision('')` returned B, because the default was applied to the input
  rather than to the answer.
- `tone: 'info'` was passed to the stat tiles from three status tables while the
  stylesheet had no `.stat--info` rule, so those tiles rendered neutral in
  silence. Found by a test that reads both sides of the pairing rather than
  exercising the happy path.
- `documents.js` had a parameter named `document`, shadowing the global. Legal,
  but `doc.kind` and `document.kind` read identically, which defeats the check
  that keeps the pure layer free of the DOM.
- Deleting the last material crashed the engine: `migrateSettings` repaired an
  empty `profiles` or `printers` list but not the other catalogues, and the
  lookups fall back to `list[0]`, which is `undefined` for an empty list. Every
  catalogue and every settings block is now repaired, in a loop, in one place.
  Found by the customer-link tamper cases.
- Settings imported `portalLink` from the customer form's page module, which
  runs `init()` when it loads. That booted the customer form on the main page,
  `getElementById('portal')` came back null, and the whole app rendered blank —
  a fault invisible to `node --check` and to every unit test, and caught only by
  loading the real page. `portalLink` now lives in its own file and the page
  module guards its own start-up.
- The customer form's Delivery tile read "Free" while packaging was still on the
  invoice, so the three tiles did not add up. It now shows what is actually
  charged and says separately that delivery was free.
