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
import { section, statTile, muted, pill } from '../controls.js';

export const id = 'guide';
export const name = 'How to use';
export const short = 'Guide';

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

export function main() {
  const companySteps = [
    step(1, 'Set the company up', 'Company details, your printers and what each '
      + 'costs to run, your filament and hardware, packaging, and the pricing model — '
      + 'where every cost goes and how much profit sits on top. This is done once, in '
      + 'Settings and the Catalogues, and everything else reads from it.', { lane: 'company' }),
    step(2, 'Set the commercial dials', 'Before anything goes to a client you set the '
      + 'discount and how busy you are — raising the price to slow demand when you '
      + 'cannot keep up. A client never sees or sets these; they are yours.', { lane: 'company' }),
    step(3, 'Import the client’s estimate as a project', 'When a client accepts an '
      + 'estimate, you pull it in as a project. Their material, colour and printer '
      + 'choices come with it, so nothing is re-typed — and their contact and shipping '
      + 'details become a new customer.', { lane: 'company' }),
    step(4, 'Add the real numbers from the slicer', 'The estimate was geometry and rules '
      + 'of thumb. Now you slice the actual part and fill in exactly what the slicer '
      + 'says — grams of each colour, total print time. Only this changes; everything '
      + 'else was already chosen.', { lane: 'company' }),
    step(5, 'Invoice, and get paid', 'The invoice carries the exact figures, so it comes '
      + 'in at or below the quote — a good surprise, never a bad one. Record the payment '
      + 'when it lands.', { lane: 'company' }),
    step(6, 'Schedule and make it', 'A paid job joins the queue for the printers, and the '
      + 'bed is scheduled by priority and machine availability. You make it, pack it and '
      + 'ship it — keeping the client posted at each step.', { lane: 'company' }),
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
            + 'by the top area, with a curing time after. An embedded NFC tag adds its coding time '
            + 'on its own. Set the rates in Settings → Labour → Post-processing.',
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
