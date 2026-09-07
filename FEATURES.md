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
