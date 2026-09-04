# 3DPrintCost Bench

Costing, quoting, production and invoicing for 3D-printed parts. One static
page. No backend, no build step, no dependencies, no network requests once the
page has loaded.

The design principle throughout is **simple on the surface, detailed and
adjustable underneath**. Drop in a model, pick what it is for, get a price. Then
open Advanced to see every cost and where it came from, or Expert to change the
assumptions themselves.

## The three numbers

The app keeps three things apart that are commonly collapsed into one, and shows
all three at once:

| | What it is |
|---|---|
| **Cost to Company** | What the part costs you to make: material, machine, electricity, labour, hardware, scrap and a configurable general allowance. |
| **Part price** | Three tanks. One holds the Cost to Company; one holds the labour, or a matching share of growth if the work came to less; one holds profit and capital, at half of the other two together. |
| **Final invoice** | The part price plus packaging, shipping and any service the customer chose, less their discount, plus tax. |

The tanks are a guideline, not an identity: one may come out over and another
under. When the work lands under a third this reduces to exactly CTC × 3, the
classic rule; when it runs over, the price follows the work instead of
pretending the work was free.

**Labour is recovered once, not tripled.** It used to sit inside the Cost to
Company and be multiplied with it, which made an hour of admin on a one-off part
cost three hours. The Cost to Company is now the physical cost of the part and
only that is multiplied; the work is paid for beside it. Where labour sits is a
setting, and the panel shows both readings worked through with your own numbers.

**Shipping is never part of the part price.** A R90 delivery does not change what
the part cost to make and is never multiplied by three. The engine asserts that
separation at runtime and the test suite proves it.

## Workspaces

| Tab | What it does |
|---|---|
| **Estimate** | Model in, price out. Drop an STL, OBJ or 3MF; pick a print intent, printer, material and quantity; get the three numbers with a full breakdown, a build-volume check and a printer comparison. |
| **Projects** | Multiple parts per project, revisions, quotes, invoices, and a production record for every print attempted — estimated against actual. |
| **Catalogues** | Printers, materials, shipping, packaging, embedded hardware and customers. Every price and specification is editable. |
| **Inventory** | Spools, hardware and packaging. Stock is folded from a movement log and is booked out automatically as production is recorded. |
| **Quotes & invoices** | Documents that keep the assumptions they were priced under, payment tracking, and a printable sheet that carries nothing internal. |
| **Dashboard** | Revenue, profit, margin, rejection rate, printer and material performance, capacity, demand, whether each machine has paid for itself, and the estimate-versus-actual learning loop. |
| **Settings** | The company, the pricing model, the print profiles, the labour operations and the estimator's own assumptions. |

Material is chosen in **two steps — the plastic, then the colour**. PLA, then
White. Underneath, a catalogue entry is still one spool, because a spool is what
you buy and what has a price; generic filament costs the same whatever colour it
is, but a silk or a glow does not, so the price lives on the combination. A
combination you do not stock is reported rather than substituted, and can be
added in one click at the plain spool's price, marked as an estimate until you
enter what you actually paid.

Each printer carries a **filament capability** — *one colour only*, *pause and
change by hand*, *multi-colour*, or *multi-material* — and it decides what the
app offers and what a colour change costs. A multi-material machine gives every
head its own plastic and colour, and primes each head once at the start. A
multi-colour machine offers the plastic once and a colour per slot, because one
hotend has one temperature — and it purges on every layer that changes, so its
waste grows with height. Pause-and-change costs a person, once per extra colour
on every part. With more than one spool loaded, each part says what percentage
of itself is each of them; the split is by volume and converted to grams
afterwards, and every filament is costed at its own price.

A machine that changes filament on its own prints a **purge tower** beside the
part, as tall as it is. The tower takes bed space, so fewer parts fit on a
plate, so a batch needs more plates — and every plate after the first is a
three-minute changeover: somebody coming back to clear the bed and start the
next run. All of it is editable, and all of it falls out of the machine you
chose rather than from a number anybody typed in.

There is also a **customer form** at `quote.html`: a separate page where a
customer drops in their own model and gets a price. It uses the same calculation
engine — there is no second pricing path anywhere in this app — and renders none
of the internals. Turn it on in Settings → Company and copy the link it gives
you.

Because there is no server, that link carries the pricing settings in its URL
fragment, and the customer's request cannot send itself: they copy or download a
summary and email it. Both are stated on the page and in Settings rather than
glossed over. A customer who reads the link itself could find your cost model, so
treat it as you would a price list you email out.

Every screen carries a **"How this works"** panel: the concept in plain language,
the formula, that formula worked through with the values currently on screen, and
what people commonly get wrong about it.

## Running it

It is plain files. Any static server will do:

```bash
python -m http.server 8847
```

## Tests

The calculation core is pure — no DOM, no globals — so it runs under Node's
built-in test runner with nothing to install:

```bash
npm test
```

274 cases, including the specification's own worked examples pinned to the cent,
a parameter sweep over every profile, printer, quantity and colour count, a check
that the model reproduces all twelve published calibration columns, and a set of
tamper cases proving an edited customer link cannot make the engine produce a
negative or non-finite price.

Two of them are worth knowing about because they catch a class of bug the happy
path cannot see. `tests/contract.test.js` reads both sides of every pairing — if
the code passes `tone: 'info'` and the stylesheet has no `.stat--info` rule, that
renders neutral in silence and nothing else would notice. And it asserts that
nothing under `js/` outside `js/ui/` touches the DOM, which is the rule that
keeps the arithmetic testable at all.

## Deploying to GitHub Pages

Push to `main`, then **Settings → Pages → Deploy from a branch → `main` /
`(root)`**. `.nojekyll` is already present. There is nothing to build.

## Layout of the code

```
index.html            the shell; everything else is built by JS
css/tokens.css        the Detronics palette as light/dark custom properties
css/layout.css        header, viewport, sidebar, footer
css/components.css    buttons, sections, fields, tables, banners
css/print.css         the printable sheet
js/money.js           currency, rounding and tax — money rounds in one place
js/countries.js       country defaults: currency, tariff, tax, labour rate
js/profiles.js        the six print intents and the empirical factor model
js/printers.js        printer database and machine-hour economics
js/materials.js       material database, per country, no exchange rates
js/labour.js          labour operations and what each one scales with
js/packaging.js       packaging and embedded hardware
js/shipping.js        shipping methods and the free-shipping rule
js/electricity.js     heat-up, printing and idle consumption
js/mesh.js            STL, OBJ and 3MF readers
js/zip.js             just enough ZIP to open a 3MF
js/geometry.js        volume, area, bounding box, supports, orientation
js/estimate.js        the evidence hierarchy and the estimators
js/demand.js          capacity-driven demand pricing
js/pricing.js         rule of thirds, allocations, discounts, presets
js/engine.js          THE calculation engine — nothing else prices anything
js/filaments.js       loaded spools, the per-part mix, and change costs
js/roi.js             what each machine has earned back
js/settings.js        every default, with a version and a migration
js/projects.js        projects, parts and production history
js/documents.js       quotes and invoices as immutable snapshots
js/inventory.js       stock as a fold over a movement log
js/calibration.js     learning from finished jobs
js/analytics.js       the dashboard
js/state.js           one state object, localStorage, URL-fragment sharing
js/portal-config.js   what the customer form is allowed to know
js/main.js            chrome, routing and the render loop
js/ui/                DOM helpers, controls, SVG renderers, export
js/ui/tools/          one controller per workspace
js/ui/portal.js       the customer form's page
tests/                node --test over the pure modules
```

The rule that keeps this workable: **everything under `js/` except `js/ui/` is
pure** — no DOM, no globals, no `window`. That is what lets the arithmetic be
tested without a browser.

## Privacy

Nothing you enter leaves your browser. No analytics, no cookies, no fonts or
scripts from other hosts, and no network request of any kind after the page has
loaded. Your models are measured in the page and never uploaded. Settings,
projects, customers and stock live in `localStorage` on your own device. Share
links encode the estimate into the URL **fragment**, which browsers never
transmit to a server. Save and Open write and read a plain JSON file on your own
disk.

## Accuracy

This section is the honest part, and it matters more than the feature list.

**What is measured.** The volume, surface area, bounding box, body count and
watertightness of a model are exact for a closed mesh — the signed-tetrahedron
sum, not an approximation. A model with open edges is reported as open rather
than measured as if it were closed, because its volume is then a guess.

**What is estimated.** Grams and minutes are estimates, and the app always says
which of four sources it used: an actual production record, a slicer estimate,
its own geometry corrected by what your machines actually did, or its own
geometry alone. **Nothing here is a slicer.** Pasting your slicer's own figures
in is the single biggest accuracy improvement available, and the app will prefer
them the moment they are there.

**The published factor tables.** The specification's print-intent factors — 31.88×
time and 30.35× material for Extra Strong against Display Only — are calibration
measurements, not physics, and they cannot be applied to a real part as
multipliers. The reason is that they multiply the wall effect by the infill
effect, and walls and infill fill the same interior; multiplied together they
count that interior twice. On a 40 × 30 × 20 mm box holding 24 cm³ of solid, the
Extra Strong factor asks for 221.9 cm³ — nine times more plastic than the part
could contain if it were machined from bar.

The app therefore does three things rather than one. It ships the factors
verbatim and shows them, held at the part's own solid volume with the clamp
reported rather than applied in silence. It quotes from a geometric model — shell,
skin and infill computed from the settings the part will actually be printed
with — which cannot exceed solid because it is built from the solid. And it learns
a real correction from your own finished jobs, which is what the factors were
reaching for in the first place. Where the two disagree, the app shows the
disagreement instead of picking silently.

**Assumptions that are visible and editable.** The sustained share of a machine's
rated flow (55% by default — nothing holds its rated flow all job), the fixed cost
of a layer, the support model (every overhang assumed held from the build plate,
which over-states supports above solid geometry), the purge per colour change and
the priming per job. All of them are in Settings → Estimator.

**Prices and specifications are starting values.** Electricity tariffs, VAT rates,
labour rates, material prices, printer specifications and locker dimensions were
compiled for early 2026 and are indicative. They move, they differ by supplier,
and printer specifications in particular should be checked against the machine in
front of you — the app marks each one until you tick that you have. Material
prices are per country in that country's own currency and are never converted;
there is no exchange rate anywhere in this app, because a spool costs what it
costs where you buy it.

**Empirical is called empirical.** Factors are labelled measured, extrapolated or
assumed, and a value outside the range that was measured says so rather than
being quietly used.

## Licence

MIT.
