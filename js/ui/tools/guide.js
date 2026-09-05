/**
 * How to use this tool.
 *
 * The app has two very different users - the company that sets it up, and the
 * client who just wants a price - and the whole flow only makes sense once you
 * can see who does what, and where the hand-offs are. So this is a flow chart in
 * words: two lanes, numbered stages, and the point where a job crosses from one
 * lane to the other.
 *
 * It reads intent, not buttons: it describes the shape of the process so a new
 * user knows where they are in it, rather than duplicating the labels already on
 * every other screen.
 */

import { el } from '../dom.js';
import {
  section, statTile, muted, pill, selectField, textField,
} from '../controls.js';
import { state, saveSoon } from '../../state.js';

export const id = 'guide';
export const name = 'How to use';
export const short = 'Guide';

/* --------------------------------------------------- step-by-step how-tos -- */

/** Pick an action, get the steps. Short and practical; grows over time. */
const HOWTOS = [
  { id: 'add-client', title: 'Add a client', category: 'Customers', steps: [
    'Open the Projects tab and open a project (or start a new one).',
    'In the sidebar’s Project section, open the Customer dropdown.',
    'Choose “New customer”, then fill in their name, email, phone and delivery address.',
    'The customer is saved and attached to the project; pick them on any future project.',
  ] },
  { id: 'add-spool', title: 'Add a filament spool to stock', category: 'Inventory', steps: [
    'Open the Inventory tab and click “Add a spool”.',
    'In the sidebar, choose the material and colour, and set what a full spool weighs.',
    'Enter a batch and a shelf location if you use them, and a reorder point.',
    'Record a “Purchased” movement for how much you bought to put it on hand.',
  ] },
  { id: 'add-resin', title: 'Add resin to stock', category: 'Inventory', steps: [
    'Open the Inventory tab and click “Add resin”.',
    'Set how much a full bottle holds (in grams) and a reorder point.',
    'Record a “Purchased” movement to put the bottle on hand.',
    'Set “Resin used per cm²” in Settings → Labour → Post-processing so it draws down correctly.',
  ] },
  { id: 'add-hardware', title: 'Add hardware (magnet, insert, NFC tag)', category: 'Catalogues', steps: [
    'To offer a new component, open Catalogues → Hardware and add it, with its price and part number.',
    'To stock it, open Inventory → “Add hardware”, pick the component, and record a purchase movement.',
    'On a part, open “Embedded hardware” and add the component with a quantity.',
  ] },
  { id: 'check-inventory', title: 'Check what stock is on hand', category: 'Inventory', steps: [
    'Open the Inventory tab.',
    'The “On hand” table lists every spool, resin bottle, hardware and packaging line and its balance.',
    'Anything at or below its reorder point is flagged, with a warning banner at the top.',
    'Open a project — it warns “buy before this can be made” if a tracked material or resin is short.',
  ] },
  { id: 'quote', title: 'Quote a customer', category: 'Orders', steps: [
    'Bring the request in with “Upload project”, or start a project and add the parts.',
    'Slice each part and paste the slicer TOTALS (grams per head, total print time) in Slicer figures.',
    'In the Workflow panel, click “Create and send quotation”.',
    'The order moves to Awaiting payment; send the customer the quote from Quotes & invoices.',
  ] },
  { id: 'take-payment', title: 'Take payment and start production', category: 'Orders', steps: [
    'When the customer pays, open the project.',
    'In the Workflow panel (Awaiting payment), click “Payment received”.',
    'The paid invoice is raised and the order moves into Production.',
  ] },
  { id: 'record-print', title: 'Record a print', category: 'Production', steps: [
    'Open the project and select the part in the Parts panel.',
    'In the Production panel, click “Record a print”.',
    'Correct the actual accepted, rejected, minutes and grams in the row.',
    'Stock (filament, hardware, resin) is booked out automatically; delete a mistaken print to reverse it.',
  ] },
  { id: 'internal', title: 'Do an internal print', category: 'Orders', steps: [
    'Open the project and set “Order type” in the sidebar.',
    '“For an employee” prices at cost and still quotes and takes payment (they pay the cost).',
    '“For the company” prices at cost, skips the quote and payment, and goes straight to production as an expense.',
    'Both skip packaging and delivery.',
  ] },
  { id: 'expedite', title: 'Let a client pay the estimate (expedite)', category: 'Orders', steps: [
    'Open Settings → Company → Customer self-quoting and set Expedite to Optional or Expedite-only.',
    'Send the client the customer form link.',
    'They tick Expedite, pay the estimate and attach proof of payment with their request.',
    'When it imports, verify the proof and click “Payment received” to raise the invoice and start production.',
  ] },
  { id: 'delete', title: 'Delete a test project / quote / movement', category: 'Housekeeping', steps: [
    'Projects: on the Projects list, use the Delete on the project’s row.',
    'Quotes & invoices: use the Delete on the document’s row.',
    'Inventory: use the Delete on a row in “Recent movements”.',
    'Each asks to confirm; deleting a project also removes its stock movements.',
  ] },
];

/** Questions worth a straight answer — grown from real clarifications. */
const FAQS = [
  { q: 'If I tick a finishing operation like “Removing support” in Settings → Labour, does it get added to every order?',
    a: 'No. Support removal only charges on parts where the “Remove support” box is ticked in post-processing. '
      + 'If no part is marked for it, it adds nothing. Ticking a client’s post-processing box and having the '
      + 'operation on in Settings does NOT charge it twice — it is priced in that one place only.' },
  { q: 'Are the slicer grams and time I enter per part or for the whole print?',
    a: 'For the whole print. Enter the slicer TOTALS (grams per head and the total print time); the app divides '
      + 'them across the quantity for you.' },
  { q: 'Is coding an NFC tag automatic?',
    a: 'No, it is opt-in. When a part has an embedded NFC tag, tick “Code the NFC tag” in post-processing to charge '
      + 'the coding, and enter the link the tag should carry. Untouched, a tag is not coded.' },
  { q: 'What does an internal (cost-only) order include?',
    a: 'The physical cost: material, machine (with its depreciation and maintenance), electricity, hardware, the '
      + 'rejection allowance and the general allowance. It excludes all labour and all profit/margin.' },
  { q: 'What is the difference between an employee and a company internal print?',
    a: 'An employee print is still quoted and paid — at cost. A company print (R&D, office use) is not quoted at '
      + 'all; it is an expense that reduces profit, and goes straight to production.' },
  { q: 'If the customer collects, do we still package it?',
    a: 'Yes. Pickup keeps the packaging (it is still boxed for collection) but skips the courier and the Delivery '
      + 'phase. “No packaging required” is the separate option that hands the parts over as they come off the printer.' },
  { q: 'Why did the estimated print time look low against my slicer?',
    a: 'The geometry estimate assumes a share of the machine’s rated flow (Settings → Estimator assumptions), which '
      + 'is optimistic for small detailed parts — lower it to suit. Once sliced, the slicer figure overrides the '
      + 'estimate, and recording actual prints calibrates it. A busy plate now also counts travel between objects.' },
  { q: 'What is the difference between Open and Upload project?',
    a: 'Open loads a whole company from a “Save all” backup and replaces what is on the device (for switching '
      + 'companies). Upload project only merges in a customer request or a project file, leaving your settings alone.' },
];

function matches(text, q) {
  if (!q) return true;
  const hay = text.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function howtoSection(rerender) {
  const query = state.ui.guideSearch || '';
  const shown = HOWTOS.filter((h) => matches(`${h.title} ${h.category} ${h.steps.join(' ')}`, query));
  const chosen = shown.find((h) => h.id === state.ui.guideHowto) || shown[0] || null;

  return section('guide-howto', 'Step-by-step: how do I…', [
    muted('Pick an action and follow the steps. Search to narrow the list — questions and how-tos both filter.'),
    textField('guide-search', 'Search', query, (v) => {
      state.ui.guideSearch = v;
      saveSoon();
      rerender();
    }, { placeholder: 'e.g. resin, quote, client, delete' }),
    shown.length
      ? selectField('guide-howto-pick', 'Action',
        shown.map((h) => ({ value: h.id, label: `${h.category} — ${h.title}` })),
        chosen?.id, (v) => { state.ui.guideHowto = v; saveSoon(); rerender(); })
      : muted('Nothing matches that search.'),
    chosen ? el('div', { class: 'panel' }, [
      el('h3', { text: chosen.title }),
      el('ol', { class: 'howto-steps' }, chosen.steps.map((s) => el('li', { text: s }))),
    ]) : null,
  ].filter(Boolean), { open: true });
}

function faqSection() {
  const query = state.ui.guideSearch || '';
  const shown = FAQS.filter((f) => matches(`${f.q} ${f.a}`, query));
  return section('guide-faq', 'Frequently asked questions', [
    shown.length
      ? el('div', {}, shown.map((f) => el('div', { class: 'faq' }, [
        el('strong', { class: 'faq__q', text: f.q }),
        el('p', { class: 'faq__a', text: f.a }),
      ])))
      : muted('No questions match that search.'),
  ], { open: false });
}

function step(n, title, body, { lane }) {
  return el('div', { class: `guide__step guide__step--${lane}` }, [
    el('div', { class: 'guide__step-num', text: String(n) }),
    el('div', { class: 'guide__step-body' }, [
      el('strong', { text: title }),
      el('p', { class: 'guide__step-text', text: body }),
    ]),
  ]);
}

function lane(title, tone, steps) {
  return el('div', { class: 'guide__lane' }, [
    el('div', { class: 'guide__lane-head' }, [
      pill(title, tone),
    ]),
    ...steps,
  ]);
}

export function main(ctx) {
  const companySteps = [
    step(1, 'Set the company up', 'Company details, your printers and what each '
      + 'costs to run, your filament and hardware, packaging, and the pricing model — '
      + 'where every cost goes and how much profit sits on top. This is done once, in '
      + 'Settings and the Catalogues, and everything else reads from it.', { lane: 'company' }),
    step(2, 'Set the commercial dials', 'Before anything goes to a client you set the '
      + 'discount and how busy you are — raising the price to slow demand when you '
      + 'cannot keep up. A client never sees or sets these; they are yours.', { lane: 'company' }),
    step(3, 'Import the request — it lands in Quotation', 'When a client submits their '
      + 'estimate, you bring it in with “Upload project” (top bar) and the order opens in '
      + 'the Quotation phase. Their material, colours — every loaded head — printer and '
      + 'quantities come with it, and their details become a new customer.', { lane: 'company' }),
    step(4, 'Quotation → slice, verify, and send', 'Slice the actual parts and fill in the '
      + 'slicer’s TOTALS (grams per head, total print time) to turn the preliminary '
      + 'estimate into a real quotation. If something is wrong, return it to the client; '
      + 'otherwise create and send the quote, and the order waits on payment.', { lane: 'company' }),
    step(5, 'Payment approves production', 'Payment is the client’s acceptance. Record it '
      + '(“Payment received”) and the paid invoice is raised and the order moves into '
      + 'Production automatically — no separate approval step.', { lane: 'company' }),
    step(6, 'Production → finish → deliver → close', 'Print, record results and inspect; a '
      + 'failed part loops back to reprint without leaving Production. Then any '
      + 'post-processing, packaging, courier delivery, and a short closeout to check the '
      + 'client is happy. The Workflow panel shows progress and the next action throughout.', { lane: 'company' }),
  ];

  const clientSteps = [
    step('A', 'Open the estimate link', 'You send the client a link. It runs entirely in '
      + 'their browser — nothing they type reaches a server — and shows only what a '
      + 'customer should see: no costs, no margins, no discount controls.', { lane: 'client' }),
    step('B', 'Try out what they want', 'They upload their model, pick a material, colour '
      + 'and finish, set a quantity, and watch the price move. They can add several '
      + 'different parts to one order.', { lane: 'client' }),
    step('C', 'Accept and send it back', 'A disclaimer makes clear this is a quotation — '
      + 'the exact figures are only known once you slice the real part. They add their '
      + 'delivery details, accept, and export the estimate back to you.', { lane: 'client' }),
  ];

  return [
    howtoSection(ctx.rerender),
    faqSection(),
    section('guide-intro', 'How this tool works', [
      muted('There are two people in this process: the company, who sets everything up and '
        + 'runs the workshop, and the client, who just wants a price. The flow below shows '
        + 'who does what, and where a job crosses from one to the other.'),
      el('div', { class: 'guide__lanes' }, [
        lane('The company', 'info', companySteps),
        lane('The client', 'ok', clientSteps),
      ]),
      el('div', { class: 'guide__crossing' }, [
        muted('The hand-offs: the company sends the client a link (before step A), and the '
          + 'client’s accepted estimate comes back to become a project (step C → step 3).'),
      ]),
    ], { open: true }),

    section('guide-modes', 'The three detail levels', [
      muted('The Simple / Advanced / Expert switch at the top right changes how much the '
        + 'screen shows. It never changes the price — only how much of the working you see.'),
      el('div', { class: 'summary-grid' }, [
        statTile('Simple', 'Just my part, please', {
          hint: 'For someone who saw a part online and just wants it made. The essential '
            + 'choices — model, finish, colours, quantity, any hardware — and a price. Nothing else.',
        }),
        statTile('Advanced', 'I have run printers', {
          hint: 'For someone who knows printing and has their own settings to enter — every cost '
            + 'and where it came from, the overrides, the slicer figures, the printer comparison.',
          tone: 'accent',
        }),
        statTile('Expert', 'Show me how it works', {
          hint: 'For learning the tool itself — adds “How this works”, the formulas and '
            + 'assumptions behind every number, and why each one is there.',
          tone: 'ok',
        }),
      ]),
    ], { open: true }),

    section('guide-ideas', 'Three ideas worth knowing', [
      el('div', { class: 'summary-grid' }, [
        statTile('Rule of thirds', 'Three fuel tanks', {
          hint: 'Cost to Company, then labour + growth, then profit + capital. A fair way '
            + 'to price that keeps the three apart instead of one big markup.',
        }),
        statTile('Labour is the workflow', 'Not print-watching', {
          hint: 'It runs from the enquiry to the invoice. That is why a small cheap part '
            + 'still costs real labour, and why a bigger batch costs less each.',
        }),
        statTile('One bed, many parts', 'Shared plates', {
          hint: 'Different parts print together on one bed. Their volumes and plates are '
            + 'combined, so sharing a plate lowers the cost per part.',
        }),
      ]),
    ], { open: false }),

    section('guide-features', 'Settings worth knowing', [
      muted('The dials below are the ones that are not obvious from their label. Each new '
        + 'feature added to the app is explained here so nothing changes a price silently.'),
      el('div', { class: 'summary-grid' }, [
        statTile('Labour rate from a salary', 'Settings → Labour', {
          hint: 'Instead of typing a rate, work it out from what the person costs a month and '
            + 'the share of their paid hours that is actually billable. Only 70% billable means '
            + 'the salary is recovered over those hours, so the rate is higher — idle time is '
            + 'priced back in rather than lost.',
        }),
        statTile('Pay a printer off faster', 'Catalogues → Printer', {
          hint: 'A machine’s expected life and its payback are different questions. Set “Pay the '
            + 'machine off within” to a number of printing hours — say 500 h on a printer that '
            + 'lasts 2400 h — and the machine-hour cost rises to recover the cost in that window. '
            + 'Leave it empty to spread the cost over the full life.',
          tone: 'accent',
        }),
        statTile('Overnight priority', 'Schedule', {
          hint: 'Tick “Prioritise long prints for overnight running” to send the longest prints '
            + 'to each machine first, so they run through the night and the short attended jobs '
            + 'fill the day. Only turn it on once a HIRA has assessed unattended overnight '
            + 'running as safe.',
          tone: 'ok',
        }),
        statTile('Post-processing', 'Estimate + Settings', {
          hint: 'Tick “Resin coat” on a part and the resin and the time to lay it on are priced '
            + 'by the top area, with a curing time after. If a part has an embedded NFC tag, tick '
            + '“Code the NFC tag” to charge the coding and enter the link it should carry — it is '
            + 'opt-in, never automatic. Set the rates in Settings → Labour → Post-processing.',
        }),
        statTile('Fill a plate, save', 'Estimate + customer form', {
          hint: 'A chart shows the price per part for one against a full plate, so a customer can '
            + 'see from the start how much filling a plate saves — the setup and plate are shared.',
          tone: 'accent',
        }),
        statTile('Multi-colour plates', 'Estimate', {
          hint: 'Choose the colours each part needs. The machine holds only so many spools; parts '
            + 'that together need more are split onto separate plates, and a colour shared between '
            + 'parts is loaded once. Max four colours per part.',
        }),
        statTile('Part numbers & Delete', 'Catalogues', {
          hint: 'Hardware carries your internal logistics part number, shown in Inventory. Every '
            + 'catalogue now has a Delete for a mistaken entry (Archive still hides one that a '
            + 'project used); a deleted default stays deleted.',
          tone: 'ok',
        }),
        statTile('Spool labels', 'Inventory', {
          hint: '“Print spool labels” makes a sheet of stick-on labels — material, batch, location '
            + 'and the spool’s id — so a spool on the shelf and one in the stock list are the same.',
        }),
        statTile('Post-processing dropdown', 'Estimate', {
          hint: 'A part ships as it comes off the printer unless you open Post-processing: remove '
            + 'support, resin coat, deburring/cleanup, code an NFC tag, or fit an after-print '
            + 'component. Each is opt-in and priced on the finished part.',
        }),
        statTile('Hardware: during vs after', 'Catalogues → Hardware', {
          hint: 'A component is fitted during the print (magnets, nuts, NFC — embedded as it '
            + 'prints) or after it (inserts, a USB light). After-print parts ship loose in the box '
            + 'unless you tick “fit” under post-processing, which assembles them.',
        }),
        statTile('Colour by height', 'Estimate → Multi-colour', {
          hint: 'Give a part colours as bands up its Z height. The machine loads its heads (4) '
            + 'automatically; a colour beyond that is a hand swap at its height — “at 12 mm: red → '
            + 'blue” — which costs labour, a machine wait, and can never run overnight.',
          tone: 'accent',
        }),
        statTile('Open vs Upload project', 'Top bar', {
          hint: '“Open” loads a whole company from a “Save all” backup and replaces what is on '
            + 'this device — how you switch between companies, or reopen your workshop after an '
            + 'update; it asks first. “Upload project” only adds a customer’s request or a '
            + 'colleague’s project file, and leaves your settings alone.',
        }),
        statTile('Expedite (pay the estimate)', 'Settings → Company · portal', {
          hint: 'Turn on Expedite (optional, or expedited-only) and a client happy with the padded '
            + 'estimate can pay it up front with proof of payment — skipping the quote. The order '
            + 'imports straight into Awaiting payment; “Payment received” raises the invoice locked '
            + 'to that estimate and starts production.',
          tone: 'accent',
        }),
        statTile('Delete a print, part, project or op', 'Projects · Settings', {
          hint: 'Recorded a print twice? Delete it and its stock comes straight back. A part can be '
            + 'removed from the parts list; a whole project can be deleted from the list (for '
            + 'clearing test/demo orders); and a labour operation line can be removed for good in '
            + 'Settings → Labour, not only unticked.',
        }),
        statTile('Heads on a project part', 'Projects → Part', {
          hint: 'A multi-material printer (a Snapmaker U1, up to four heads) gives each head its '
            + 'own material and colour, filled in from the customer’s request. After slicing, '
            + 'enter the TOTAL grams for each head and one total print time (for the whole '
            + 'print, not per part) — every head is then costed at its own plastic’s price.',
          tone: 'ok',
        }),
        statTile('Order workflow phases', 'Projects → Workflow', {
          hint: 'An order walks six phases — Quotation, Awaiting payment, Production, '
            + 'Post-processing, Packaging, Delivery, Closeout — with an overall and a '
            + 'per-phase progress bar worked out from what you have actually recorded. It shows '
            + 'only the next action, loops reprints inside Production, skips post-processing when '
            + 'nothing needs it, and can Hold or Cancel from any phase.',
          tone: 'accent',
        }),
        statTile('Event history & client updates', 'Projects → Workflow', {
          hint: 'Every order keeps an automatic event history — quote sent, payment, prints, '
            + 'inspection, reprints, delivery, closeout — so there is an audit trail nobody has '
            + 'to maintain. “Copy client progress update” makes a short progress note for the '
            + 'customer from the current phase.',
        }),
        statTile('Internal (cost-only) orders', 'Projects · Settings', {
          hint: 'Tick “Internal order” on a project to price it at the physical cost only — '
            + 'material, machine, electricity, hardware and the allowances — with no labour and no '
            + 'profit. Settings → Company also gives a “cost-only” portal link to send staff so '
            + 'they can see what a print actually costs.',
          tone: 'ok',
        }),
        statTile('Busy-plate print time', 'Settings → Estimator', {
          hint: 'Print-time estimates now count the toolhead travel between objects on a shared '
            + 'plate (a new “Travel between objects” assumption), so a plate of many small parts is '
            + 'not under-counted. The “Sustained share of the rated flow” slider is still the main '
            + 'lever if estimates run low — and pasted slicer figures always win.',
        }),
      ]),
    ], { open: false }),

    section('guide-durability', 'Keeping your work as the app grows', [
      muted('New versions of the app ship often. Your data is never in the app’s code — it lives '
        + 'in this browser — so a new version does not wipe it, and the app upgrades your saved '
        + 'data to each release as it loads. Here is how to make sure nothing is ever lost.'),
      el('div', { class: 'summary-grid' }, [
        statTile('1 · Same address', 'Data just stays', {
          hint: 'Keep opening the app from the same web address. Your workshop is stored against '
            + 'that address, so updating to the latest version keeps everything — no import needed.',
        }),
        statTile('2 · Save a backup', 'Settings → Backup', {
          hint: 'Now and then, hit “Save all” (top bar) or Settings → Backup & restore. One file '
            + 'holds your whole setup and every project, quote and invoice — your safety net for a '
            + 'cleared browser or a new computer.',
          tone: 'accent',
        }),
        statTile('3 · Restore anywhere', 'One file back in', {
          hint: 'On a new computer or a fresh browser, open the latest app and use Settings → '
            + 'Backup & restore → “Restore everything” to bring your whole workshop back, upgraded '
            + 'to the new version.',
        }),
        statTile('Automatic option', 'Team sync', {
          hint: 'Connect a Google Drive or OneDrive file in Team sync and it keeps a live copy of '
            + 'everything as you work — an always-current backup any future version can open.',
          tone: 'ok',
        }),
      ]),
    ], { open: false }),
  ];
}
