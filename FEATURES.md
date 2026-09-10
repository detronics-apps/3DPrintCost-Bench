# Features log — 3DPrintCost Bench

A running record of what the app does and why each piece was added, so any
behaviour can be traced back to the decision behind it — and so each entry is
ready to become a short "here's what I added and how it works" video.

Three sections, by **who needs to know**: the **client** (using the quote form),
the **operator** (running the workshop app), and the **skill/developer** (the
decision and the rule behind it). Newest at the top of each section. Backfilled
from the development history on 2026-09-07; kept up per feature from here on.

---

## For the client (the quote form)

- **Print-type radar** (2026-09-07) — each print type shows a four-axis radar
  (Speed, Cost, Strength, Precision; higher = better, so Cost 5 = cheapest) so you
  can see at a glance what it trades off before you pick. Six types are available
  (Extra Strong, Strength, Fit, Function, Visual, Display Only) — the company
  chooses which to offer.
- **What the print types balance** (2026-09-07) — the "Good to know" panel now
  explains the four things a print trades off (Speed, Cost, Strength, Precision;
  higher is better for you, so a Cost of 5 = cheapest) and roughly where each
  intent leans, so you pick the right one.
- **Phone auto-formats** (2026-09-07) — however you type it (no spaces, a missing
  0, a +27), it tidies to the country's spaced local form, e.g. 082 123 4567; it
  must also have the right count of digits (9 after +27), and a valid field turns
  a clearly prominent green.
- **Banking details on the quote** (2026-09-07) — your bank/account details print
  on the quote and invoice, so a client who accepts can pay straight away.
- **Parts that must fit** (2026-09-07) — tick "this part must fit or mate with
  another part" and we ask you to attach a dimensioned drawing or photo of the
  critical dimensions; a print is only as accurate as the dimensions we're given.
- **Good to know: file types & reprints** (2026-09-07) — a note explains that a
  .3mf carries your colours (an .stl is shape only, so a multi-colour .stl needs
  a reference image and painting time), and that we reprint our printer's faults
  free but not failures caused by the part's shape or settings (a 3 mm tower
  150 mm high, layer lines on a shallow top curve) — reprinting those gives the
  same result, so we suggest a change instead.
- **International vs local** (2026-09-07) — if the workshop ships only locally,
  your country is fixed and you just fill in your details; if it ships abroad,
  you pick your country and international delivery appears. Prices are always in
  the workshop's currency.
- **Privacy, in plain words** (2026-09-07) — the form uploads nothing: your
  details are packaged into the file/link you send, and the workshop stores them
  on its own device to make your order. No cookies, no tracking. A short notice
  on the form says so and how to have your details removed.
- **Business & VAT** (2026-09-07) — tick "This is a business" to add a VAT number
  (it goes on your invoice) and default a business delivery address; still
  changeable to a home address.
- **Confirm before you send** (2026-09-06) — when you send, a summary shows what
  you ordered and flags the easy-to-miss things: no finishing chosen, collecting
  with no packaging (with a box suggestion for several parts), or after-print
  parts you didn't ask to have fitted.
- **Fit is on by default** (2026-09-06) — if you add a threaded insert or similar
  after-print part, it is set to be installed unless you untick it. Nobody is
  surprised their inserts were fitted.
- **The form checks itself** (2026-09-06) — required fields are marked with *,
  turn green when they look right, and the send button tells you what's wrong and
  jumps you to it rather than greying out silently. Nothing you typed is lost.
- **Save & reload your details** (2026-09-05) — a returning customer downloads
  their details once and loads them next time instead of retyping. First name and
  surname are separate fields.
- **Post-processing, spelled out** (2026-09-05) — an "Add post-processing?" drop
  down offers support removal, resin coat, deburring, fitting parts, and coding an
  NFC tag; the options only appear when they apply to what you added.
- **Only delivery that fits** (2026-09-06) — you are never offered a box or a
  courier locker that your parts won't physically fit into.
- **Collect it yourself** (2026-09-05) — a "no delivery" option; then no address
  is required and no courier is charged.

## For the operator (running the app)

- **General allowance = its named categories** (2026-09-10) — the mystery "general
  allowance %" is now the sum of the four commercial costs it actually covers:
  marketing, admin, R&D and storage, each a % of the production cost, set in
  Settings → Cost to Company (and on the estimate's Allowances panel). The "How
  this works → Cost to Company" panel itemises them so the allowance visibly adds
  up. Nothing you were charging changes on upgrade — your old allowance total is
  split across the four and preserved; tune them from there.
- **Project page: parts, layout, colour-by-height** (2026-09-10) — four changes to
  building a project. You can now add another part straight from the part editor
  (an "Add another part" button in its action row — no more hunting for it), and
  the model upload sits at the top of the part editor, so you load the model first
  and name/size it from what it actually is. Project parts gained the estimate
  tool's colour-change-by-height (colour bands up the part, with the hand-swap
  warning when a part needs more colours than the machine loads). And the
  estimate-only "10% white / 90% yellow" percentage split is gone from projects —
  a project is priced from the slicer's exact grams per head, so the split added
  nothing; colours are set as height bands instead.
- **Pricing-model clarity** (2026-09-10) — three changes so the numbers read the
  way they work. (1) "Where the commercial share goes" no longer looks like a 152%
  markup: the Weight is a plain score you set, the Share is that weight's slice of
  100% (the shares total 100%), and a new "Already charged" column shows the real
  direct cost for buckets that name one (machine, labour, packaging), so you can see
  the actual figure beside the notional share. (2) Every "How this works" panel that
  warns about a common mistake now follows it with a green "How it actually works"
  line — the correction, not just the error. (3) A project set to *internal —
  company* is now priced at bare direct cost: the rejection and general allowances
  drop away (an internal expense isn't padded); an *internal — employee* job keeps
  them, since it's still billed at cost. _A deeper re-model of the commercial share
  (general allowance = the un-accounted categories, categories capturing the full
  invoice) is proposed and awaiting sign-off, since it changes the price._
- **Your logo and electricity tariff now stick** (2026-09-10) — a bug reset the
  company logo and the electricity tariff to their defaults on every load (and on
  every team-sync round-trip), so the logo kept vanishing and the tariff kept
  falling back to the domestic block rate. Fixed. If yours were already lost, set
  them once more and they will stay put.
- **Every estimator control on a project part** (2026-09-10) — the project part
  editor is now a superset of both estimators: past Simple it shows the same
  per-part tuning the Estimate tool and client form do — override the profile's
  infill %, infill pattern, wall loops, layer height, shrinkage, angle
  optimisation, ironing and fuzzy skin for one part; scale its labour with a
  "Labour complexity" multiplier; force a parts-per-plate count; add an
  other-direct cost; and pick which estimate to trust on the slicer figures.
  Nothing you can set on an estimate is missing from a project part now, so a job
  can be fine-tuned as it goes into production without dropping back to the
  estimator. Everything is hidden in Simple and appears in Advanced/Expert, the
  same as on the estimate.
- **Readable banking + invoice thank-you** (2026-09-08) — two touches to the
  printed documents. Type each banking detail on its own line in Settings →
  Company (bank, account name, account number, branch code, reference) and each
  prints on its own line on the quote and invoice, so a client can read and copy
  them instead of them running together on one line. And a short **thank-you
  note** now prints at the foot of an **invoice** — set the default in Settings →
  Company, or edit it for one invoice from Quotes & invoices (open the invoice →
  "Thank-you note" in the sidebar). It is separate from the packaging thank-you
  card that goes in the box.
- **Multi-colour printer history import** (2026-09-07) — the "Printer history
  (prior runs)" CSV import now has a "Printer for the sample" picker. A
  single-colour machine gets the old one-Grams-column template; a multi-head
  machine (Snapmaker U1, Bambu X1E — four heads each, from the printer's
  `colourSlots`) gets a grams and a colour column per head, with the printer's
  name filled in. The importer sums the heads into the run's total grams (which is
  what a machine's lifetime counts) and keeps the per-head detail; a single Grams
  column still imports unchanged. Colour is recorded, not costed — prior runs feed
  only machine lifetime, not stock or a customer.
- **Nothing is lost pushing an estimate to a project** (2026-09-07) — "Save this
  bed as a project" now carries every per-part choice the estimator holds: the
  fit-critical flag, colour-by-Z bands, a manual parts-per-plate count, an extra
  direct cost, the estimate method (auto/manual/slicer) and the model file name —
  which were previously dropped. A client request already carried everything.
  With the fit flag now on the project part too, every field that comes in from
  an estimate or a client request is fully editable in the project.
- **Fit-critical flag on a project part** (2026-09-07) — the project part editor
  now has the "This part must fit or mate with another part" tick (with the
  hold-the-dimensions reminder), the same as the client form — so the operator
  can set or clear it directly, not only receive it from a client request.
- **Two new How-to answers** (2026-09-07) — the guide's FAQs now cover where to
  choose internal vs customer pricing (the project's "Order type", not the quick
  Estimate) and whether "Save all" is still needed with team sync on (no, sync
  auto-saves; "Save all" is an occasional downloadable backup).
- **Production really draws down stock** (2026-09-07) — recording a print on a
  project part now subtracts the filament and each component's quantity from the
  actual stock items on hand — the spool in use (the emptiest one still with
  stock), the tracked component, the resin bottle — so the Inventory "On hand"
  figures fall. Deleting the print puts it all back. (Previously the draw was
  booked against an aggregate id that never touched the real stock counts.)
- **Components & post-processing on a project part** (2026-09-07) — the project
  part editor now has the same "Components" (embedded hardware) and
  "Post-processing" choices as the estimate and client form, per part — so you can
  add or change a magnet/insert/NFC tag (and its finishing) on a project directly,
  not only when it came in from an estimate.
- **Deactivate a printer** (2026-09-07) — a printer can be marked "under
  maintenance" in Catalogues → Printers; it then disappears from the printer
  choices in the estimator, project parts and the client form, while any estimate
  or project already using it keeps working. Distinct from Archive (retiring it).
- **Mass update & delete in Catalogues** (2026-09-07) — Materials, Shipping,
  Packaging, Hardware and Customers each have "Update or delete many at once":
  tick rows, pick a setting (price, days, weight, category, discount…) and apply
  it to all selected, or delete them together (skipping anything a project uses).
- **Team sync keeps everything** (confirmed 2026-09-07) — a shared-file sync
  carries the whole workshop: settings included (electricity rate, company logo,
  every material/hardware/packaging price), plus projects, customers, inventory
  and the imported printer history. (The printer history was newly added to the
  backup/sync payload so it travels too.)
- **Import what you already had (CSV)** (2026-09-07) — Settings → Backup &
  restore → "Import from a spreadsheet". Four separate, additive imports so you
  start from where the workshop is, not a blank slate: existing clients (so you
  don't re-type returning customers, matched by email/phone), hardware on hand
  and rolls of filament on hand (opening stock you can supply immediately), and a
  printer's prior print history (minutes/hours + grams, so its lifetime counts
  what it did before the app — not tied to any customer). Each has a one-click
  sample CSV, only adds, and reports rows it couldn't read by line number.
- **Team-sync setup guide** (2026-09-07) — a step-by-step in How-to for setting
  up Google Drive/OneDrive team sync (install the desktop drive, pick a
  workshop.json in the synced folder, connect it, share the same file).
- **Fit-critical flag on imports** (2026-09-07) — when a client marks a part as
  having to fit another, the imported project carries a "FIT-CRITICAL" note to
  hold the critical dimensions and check for a dimensioned drawing. Two guide FAQs
  cover the .stl-vs-.3mf colour question and the reprint policy.
- **Ship-internationally switch** (2026-09-07) — Settings → customer form. Off
  keeps the client form local-only; on allows any country and international
  couriers. No currency conversion either way (the app has no exchange rate).
- **Returns/refund policy** (2026-09-07) — Settings → Company; prints on quotes
  and invoices next to your terms. A VAT number a client supplies also prints on
  the invoice.
- **Default printer** (2026-09-05) — Settings → Company. New estimates, new
  project parts and the client form all open on it.
- **One price per country** (2026-09-05) — the catalogue price editors show a
  single field in your currency (set by your company country), not one per
  country.
- **Configurable post-processing** (2026-09-05) — Settings → Post-processing is a
  list you edit and add to. Each step is priced per part, per cm² of top area, or
  per matching component, and is gated on hardware so it only appears when
  relevant. Support removal and deburring moved here from the labour operations.
- **"Prints due today" flag** (2026-09-06) — the Dashboard shows a dismissible
  banner listing prints scheduled to start today that aren't yet marked in
  production, so nothing sits idle unnoticed.
- **No duplicate customers** (2026-09-05) — importing a returning client's request
  matches them by email or phone, reuses and refreshes the record, and links the
  new project to it.
- **Money bars read at a glance** (2026-09-06) — the cost / price / invoice bars
  each fill the full width to their own total (shown on the right), instead of the
  smaller two looking half-empty.
- **Newsletter opt-in** (2026-09-05) — an optional, unticked consent box on the
  form (turn it on in Settings); the choice arrives on the customer record.
- **Section collapse fixed** (2026-09-06) — collapsible panels now actually hide
  their contents (was an app-wide CSS bug).

## For the skill / developer (the decisions)

- **Per-head history via colourSlots, summed to a total** (2026-09-07) —
  `importPrintRuns` now takes `materials` and auto-detects `Head N grams`/`Head N
  colour` columns (regex on the header, tolerant of spellings), summing head grams
  into the run's total `grams` so `machineHistory` (which reads only total grams +
  minutes) is untouched; per-head `{grams,colour,materialId}` is kept as optional
  `heads` detail, colour matched to a material where possible but the label always
  preserved. `printRunTemplate(printer)` shapes the sample from the printer's
  `colourSlots` (loaded-at-once heads: 4 for Snapmaker U1 and Bambu X1E) — not
  `maxColours` (16 for the X1E, which counts manual swaps). Colour is descriptive,
  not costed: prior runs are machine-lifetime only, tied to no stock or customer.
  The UI picks the printer via `state.ui.importPrinterId` (defaults to the default
  printer).
- **Import mappers must be field-complete** (2026-09-07) — a part has one canonical
  shape (`makePart`), so any mapper that builds a project part from another source
  must copy every field or it silently drops data. The estimate→project mapper
  (estimate.js "Save this bed as a project") was missing `mustFit`, `colourBands`,
  `partsPerPlateOverride`, `otherDirectCost`, `estimateMethod` and the model name
  (mapped to the project's `modelFileId`, not the estimator's `modelName`); the
  portal→project mapper (`partFrom`) was already complete. `mustFit` is now also
  editable on the project part, closing portal↔project parity. Estimator-only
  fields the project never reads (`orientedUp`) are deliberately not carried —
  the resulting `orientedSize` is.
- **Production movements resolve to real stock ids** (2026-09-07) —
  `movementsForRun` now takes an optional `inventory` and resolves each draw to a
  real stock item id: filament to the chosen `attempt.spoolId`, else the emptiest
  in-stock spool of that material (`spoolsFor(...)[0]` — finish the near-empty one
  first); a component to the stock item whose `refId` matches the spec. It falls
  back to the old aggregate `material:`/`hardware:` ids when no inventory is
  passed, so the pure tests (which call it without inventory and assert only
  quantities/reasons) stay green. The caller passes `state.inventory`; the resin
  draw's gate is `resinGramsForPart(...) > 0`, not the dead `part.needsResin`
  boolean. `balances` keys strictly on `itemId`, so only a real id nets.
- **Profile radar from editable ratings** (2026-09-07) — each profile carries a
  `ratings` {speed,cost,strength,precision} 1–5 (higher = better, Cost 5 =
  cheapest), backfilled onto existing installs by the profile field top-up. A
  pure `radarChart` SVG (svg/radar.js) renders the diamond; the portal shows the
  selected profile's, Settings → Print profiles edits the four with a live
  preview. Which profiles a client sees stays the existing allowedProfiles ticks.
- **Onboarding import, four separate & unconnected** (2026-09-07) — pure
  `csv.js` (parse) + `imports.js` (four importers returning what to add + errors,
  no mutation); the UI applies. Clients dedup by email/phone; hardware books an
  opening 'purchase' movement against a matched stock item; filament is a spool
  per row (startingG = opening balance); print history is prior runs
  {printerId,minutes,grams,at} folded into `machineHistory(projects, priorRuns)`
  so a machine's hours/lifetime count pre-app work — deliberately NOT modelled as
  customer-linked projects. `state.priorRuns` added + migrated. See the
  detronics-app skill's onboarding pattern (`references/product-patterns.md`).
- **Fit as a flag, not a new profile** (2026-09-07) — "must fit another part" is a
  per-part boolean (`mustFit`), not a new print profile, so it needs no pricing
  model; it drives a client note, a confirm-summary warning and a FIT-CRITICAL
  line on the imported project. The .stl/.3mf and reprint-policy explanations are
  client-facing text (portal "Good to know") plus operator FAQs — communication,
  not logic.
- **No FX by design** (2026-09-07) — international shipping never converts
  currency; a foreign client is quoted in the company's currency and offered
  international delivery only. Adding real exchange rates + per-country tax is a
  much larger change and was deliberately not taken.
- **App vs company, legally** (2026-09-07) — the app transmits nothing (local
  storage; sharing via URL fragment; the client sends a file). The *company* still
  holds personal data once it imports, so a privacy notice + marketing-consent
  opt-in apply, but cookie banners / third-party disclosures / a custom 404 do
  not. See the detronics-app skill's `references/legal.md`.
- **Post-processing is data, not code** (2026-09-05) — the finishing steps are a
  configurable list priced by one of three bases with a hardware gate, so new
  steps need no code. Charged on surviving parts, never multiplied by scrap. Old
  projects/quotes/settings migrate to the new shape.
- **Fit default = on** (2026-09-06) — an after-print component defaults to fitted
  because the regret is asymmetric: being surprised it was installed is milder
  than being surprised it shipped loose. Untickable.
- **Submit is a sanity checker, not a gate** (2026-09-06) — the send button stays
  active and reports errors on press (red + scroll-to-first), keeping all entered
  data. Empty required fields go red only after a press. A pure email/phone
  validator returns {ok, value, message}; the UI only renders its verdict.
- **Dedup by natural key** (2026-09-05) — customers match on normalised email, then
  phone (last nine digits, so +27… and 082… match). Reuse + refresh, never
  duplicate; re-point the imported project at the existing record.
- **Packaging/courier fit** (2026-09-06) — `containerFits`/`packageFits` already
  existed; the fix was filtering the manual dropdowns to fitting options so they
  agree with "cheapest that fits". A current selection is kept so nothing is
  dropped silently.
- **Each money bar to its own total** (2026-09-06) — `moneyDiagram` was on one
  shared scale, leaving short bars half-empty; each bar now fills to its own total
  with the total on the right as the real size.
- **Migrations are mandatory** (ongoing) — settings, projects and the quick
  estimate each carry a version and a migration; `{...defaults, ...incoming}` must
  never overwrite a default with `undefined`.
