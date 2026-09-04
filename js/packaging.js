/**
 * Packaging and embedded hardware catalogues. Pure.
 *
 * Both are real consumables with real prices, which is why neither is a
 * percentage. Packaging is an order-fulfilment expense and sits outside the
 * thirds; hardware is consumed *by the part* and belongs inside the Cost to
 * Company. Those are different places, and the difference is not cosmetic.
 */

import { num } from './money.js';

const item = (spec) => ({
  archived: false,
  perOrder: 1,
  prices: {},
  ...spec,
});

/**
 * `inner` is the usable internal size in mm, longest first. `kind` decides
 * whether an item is a container (one is chosen) or a consumable (all the
 * enabled ones are added).
 */
export const DEFAULT_PACKAGING = [
  item({
    id: 'bag-small',
    name: 'Padded bag, small',
    kind: 'container',
    inner: [200, 150, 40],
    weightG: 15,
    prices: { ZA: 6.5, NL: 0.4, CN: 1.5, US: 0.45 },
    supplier: 'Packaging wholesaler',
  }),
  item({
    id: 'bag-large',
    name: 'Padded bag, large',
    kind: 'container',
    inner: [340, 240, 60],
    weightG: 28,
    prices: { ZA: 11, NL: 0.7, CN: 2.6, US: 0.8 },
  }),
  item({
    id: 'box-small',
    name: 'Box, small',
    kind: 'container',
    inner: [200, 150, 100],
    weightG: 90,
    prices: { ZA: 14, NL: 0.85, CN: 3, US: 0.95 },
  }),
  item({
    id: 'box-medium',
    name: 'Box, medium',
    kind: 'container',
    inner: [310, 220, 180],
    weightG: 180,
    prices: { ZA: 22, NL: 1.35, CN: 5, US: 1.5 },
  }),
  item({
    id: 'box-large',
    name: 'Box, large',
    kind: 'container',
    inner: [450, 350, 300],
    weightG: 340,
    prices: { ZA: 38, NL: 2.4, CN: 9, US: 2.6 },
  }),
  item({
    id: 'envelope',
    name: 'Document envelope',
    kind: 'container',
    inner: [300, 210, 10],
    weightG: 8,
    prices: { ZA: 3.5, NL: 0.2, CN: 0.8, US: 0.25 },
  }),
  item({
    id: 'protective',
    name: 'Protective wrap',
    kind: 'consumable',
    weightG: 20,
    prices: { ZA: 4, NL: 0.25, CN: 0.9, US: 0.3 },
    note: 'Per order, scaled by how many parts are in the box.',
    perUnit: true,
  }),
  item({
    id: 'tape',
    name: 'Tape',
    kind: 'consumable',
    weightG: 5,
    prices: { ZA: 1.5, NL: 0.1, CN: 0.3, US: 0.12 },
  }),
  item({
    id: 'label',
    name: 'Label',
    kind: 'consumable',
    weightG: 2,
    prices: { ZA: 1.2, NL: 0.08, CN: 0.25, US: 0.1 },
  }),
  item({
    id: 'thankyou-card',
    name: 'Thank-you card',
    kind: 'consumable',
    weightG: 3,
    prices: { ZA: 2.5, NL: 0.2, CN: 0.4, US: 0.25 },
    note: 'One per order. Archive it if you do not include one.',
  }),
];

export function itemPrice(entry, countryId) {
  if (!entry) return 0;
  if (entry.priceOverride != null && num(entry.priceOverride, -1) >= 0) return num(entry.priceOverride);
  const price = entry.prices?.[countryId];
  return price == null ? 0 : num(price);
}

export function findPackaging(items, id) {
  return items.find((p) => p.id === id) || null;
}

/** Does a stack of `count` parts of size `dims` go in this container? */
export function containerFits(entry, dims, count = 1) {
  if (!entry?.inner) return false;
  const inner = [...entry.inner].map(num).sort((a, b) => b - a);
  const need = [num(dims?.x), num(dims?.y), num(dims?.z)].sort((a, b) => b - a);
  if (!need.every((v, i) => v <= inner[i])) return false;
  // A crude packing check: the parts have to occupy less than 60% of the box,
  // because nothing packs perfectly and the padding has to go somewhere.
  const partVolume = need[0] * need[1] * need[2] * Math.max(1, count);
  const boxVolume = inner[0] * inner[1] * inner[2];
  return partVolume <= boxVolume * 0.6;
}

/**
 * Choose a container and add the consumables.
 *
 * Returns `container: null` when nothing in the catalogue holds the part, which
 * the UI must show rather than swallow - it means somebody has to buy a box.
 */
export function choosePackaging(items, { dims, count = 1, countryId, forcedContainerId = null, consumables = null }) {
  const live = items.filter((p) => !p.archived);
  const containers = live.filter((p) => p.kind === 'container');

  const container = forcedContainerId
    ? findPackaging(live, forcedContainerId)
    : containers
      .filter((p) => containerFits(p, dims, count))
      .sort((a, b) => itemPrice(a, countryId) - itemPrice(b, countryId))[0] || null;

  const enabled = consumables
    ? live.filter((p) => p.kind === 'consumable' && consumables.includes(p.id))
    : live.filter((p) => p.kind === 'consumable');

  const lines = [];
  if (container) {
    lines.push({
      id: container.id, name: container.name, qty: 1,
      each: itemPrice(container, countryId), cost: itemPrice(container, countryId),
      weightG: num(container.weightG),
    });
  }
  for (const c of enabled) {
    const qty = c.perUnit ? Math.max(1, Math.round(num(count, 1))) : num(c.perOrder, 1);
    lines.push({
      id: c.id, name: c.name, qty,
      each: itemPrice(c, countryId), cost: itemPrice(c, countryId) * qty,
      weightG: num(c.weightG) * qty,
    });
  }

  return {
    container,
    lines,
    cost: lines.reduce((total, line) => total + line.cost, 0),
    weightG: lines.reduce((total, line) => total + line.weightG, 0),
    outerDims: container
      ? { x: container.inner[0], y: container.inner[1], z: container.inner[2] }
      : { x: num(dims?.x), y: num(dims?.y), z: num(dims?.z) },
    fits: Boolean(container) || containers.length === 0,
  };
}

/* -------------------------------------------------------------- hardware -- */

const hardware = (spec) => ({
  archived: false,
  // WHEN the component meets the part:
  //   'during'  embedded mid-print - the print pauses, it is placed, printing
  //             encases it (magnets, captive nuts, NFC tags). Fitting it is
  //             inseparable from adding it.
  //   'after'   fitted once the part is printed (heat-set inserts, a USB light).
  //             Adding it only SUPPLIES the component; fitting it is a
  //             post-processing choice, and until then it ships loose in the box.
  stage: 'during',
  pauseMinutes: 1,
  insertMinutes: 2,
  failureRisk: 0.01,
  extraMaterialG: 0,
  /** The component's own weight, so a loose one adds to the shipment. */
  weightG: 0,
  prices: {},
  // The workshop's own logistics reference for this component. It links the
  // entry to the internal system that already maps it to a supplier and their
  // SKU, so the app only has to carry the one number. Blank until set.
  partNumber: '',
  // Whether this component is an NFC tag, so the post-processing step knows to
  // add the labour of coding it after the print.
  nfc: false,
  ...spec,
});

/** Components embedded during the print, per section 12 of the specification. */
export const DEFAULT_HARDWARE = [
  hardware({
    id: 'magnet-6x3',
    name: 'Neodymium magnet 6 × 3 mm',
    category: 'Magnet',
    prices: { ZA: 3.2, NL: 0.18, CN: 0.5, US: 0.2 },
    failureRisk: 0.02,
    note: 'Orientation matters; a magnet fitted the wrong way round is scrap.',
  }),
  hardware({
    id: 'magnet-10x2',
    name: 'Neodymium magnet 10 × 2 mm',
    category: 'Magnet',
    prices: { ZA: 4.5, NL: 0.25, CN: 0.7, US: 0.28 },
    failureRisk: 0.02,
  }),
  hardware({
    id: 'nfc-ntag215',
    name: 'NFC tag, NTAG215',
    category: 'Electronics',
    nfc: true,
    prices: { ZA: 12, NL: 0.6, CN: 1.8, US: 0.65 },
    insertMinutes: 3,
    failureRisk: 0.03,
    note: 'Test after printing; heat can kill a tag that fitted perfectly.',
  }),
  hardware({
    id: 'nut-m3',
    name: 'M3 hex nut',
    category: 'Fastener',
    prices: { ZA: 0.6, NL: 0.03, CN: 0.08, US: 0.04 },
    insertMinutes: 1,
  }),
  hardware({
    id: 'nut-m4',
    name: 'M4 hex nut',
    category: 'Fastener',
    prices: { ZA: 0.9, NL: 0.05, CN: 0.12, US: 0.06 },
    insertMinutes: 1,
  }),
  hardware({
    id: 'insert-m3',
    name: 'M3 heat-set insert',
    category: 'Insert',
    stage: 'after',
    prices: { ZA: 2.4, NL: 0.14, CN: 0.35, US: 0.15 },
    pauseMinutes: 0,
    insertMinutes: 1.5,
    weightG: 0.3,
    note: 'Fitted after printing with a soldering iron. Supplied loose unless you '
      + 'add “fit” under post-processing, which assembles it for a finished part.',
  }),
  hardware({
    id: 'screw-m3-10',
    name: 'M3 × 10 cap screw',
    category: 'Fastener',
    stage: 'after',
    prices: { ZA: 1.1, NL: 0.06, CN: 0.15, US: 0.07 },
    pauseMinutes: 0,
    insertMinutes: 1,
    weightG: 0.9,
    note: 'Driven in after printing. Supplied loose unless you add “fit” under '
      + 'post-processing.',
  }),
];

export function findHardware(items, id) {
  return items.find((h) => h.id === id) || null;
}

/**
 * Cost of the embedded hardware for ONE part.
 *
 * `failureRisk` is the chance the insertion ruins the part. It is returned
 * separately rather than folded in, because it belongs with the other scrap in
 * the rejection line and adding it here would charge it twice.
 */
export function hardwareCost(catalogue, entries, countryId) {
  const lines = [];
  let cost = 0;              // DURING-print components, embedded and at risk
  let pauseMinutes = 0;
  let insertMinutes = 0;
  let inserts = 0;
  let nfc = 0;
  let extraMaterialG = 0;
  let survives = 1;

  let afterCost = 0;         // AFTER-print components, added to the finished part
  let fitInserts = 0;        // after-print components chosen to be fitted
  let fitMinutes = 0;        // the labour of assembling them (post-processing)
  let looseWeightG = 0;      // after-print components shipped loose, not fitted
  let looseCount = 0;

  for (const entry of entries || []) {
    const spec = findHardware(catalogue, entry.hardwareId);
    if (!spec) continue;
    const qty = Math.max(0, Math.round(num(entry.qty, 1)));
    if (qty === 0) continue;
    const each = itemPrice(spec, countryId);
    const after = spec.stage === 'after';
    const fit = after && entry.fit === true;

    lines.push({
      id: spec.id, name: spec.name, qty, each, cost: each * qty,
      stage: after ? 'after' : 'during', fit,
    });

    if (after) {
      // The component is supplied either way; fitting it is the choice.
      afterCost += each * qty;
      if (fit) {
        fitInserts += qty;
        fitMinutes += num(spec.insertMinutes) * qty;
      } else {
        looseCount += qty;
        looseWeightG += num(spec.weightG) * qty;
      }
      continue;
    }

    // During-print: embedded as the part prints, so it costs a pause and an
    // insertion, and it is at risk of ruining the print.
    cost += each * qty;
    pauseMinutes += num(spec.pauseMinutes) * qty;
    insertMinutes += num(spec.insertMinutes) * qty;
    extraMaterialG += num(spec.extraMaterialG) * qty;
    inserts += qty;
    if (spec.nfc) nfc += qty;
    survives *= (1 - Math.min(0.95, Math.max(0, num(spec.failureRisk)))) ** qty;
  }

  return {
    lines,
    cost,
    pauseMinutes,
    insertMinutes,
    inserts,
    /** How many of the embedded components are NFC tags, for the coding step. */
    nfc,
    extraMaterialG,
    /** After-print components: money, the fitting some of them were given, and
     *  the weight of the ones shipped loose. */
    afterCost,
    fitInserts,
    fitMinutes,
    looseWeightG,
    looseCount,
    /** Probability the part survives every insertion. */
    survivalRate: survives,
    failureRate: 1 - survives,
  };
}
