/**
 * Printer database and machine economics. Pure.
 *
 * The specification is explicit that printers must not be ranked by assumption.
 * So there is no "cheap / mid / expensive" field anywhere in this file: the
 * machine-hour cost falls out of the money that was actually spent on the
 * machine, and the order the three shipped printers come out in is a *result*,
 * not a decision. The tests prove it by making the Ender the expensive one.
 *
 * All prices are in the workshop's own currency. Specifications marked
 * `verified: false` are starting values to be checked against the machine in
 * front of you, not manufacturer claims this app can stand behind.
 */

import { num } from './money.js';

/**
 * What a machine can have loaded at once.
 *
 * This is a real difference between machines, not a marketing tier, and it
 * decides what the app may offer:
 *
 *   single         one spool. Everything on the plate is that spool.
 *   multicolour    several spools feeding ONE hotend. Colours vary freely; the
 *                  plastic cannot, because there is only one temperature to
 *                  set and one melt zone to share.
 *   multimaterial  independent tool heads, each with its own hotend, so the
 *                  plastic can vary too.
 *
 * Set per printer, because it is a property of the machine.
 */
export const COLOUR_MODES = [
  {
    id: 'single',
    name: 'One colour only',
    materialsVary: false,
    coloursVary: false,
    manual: false,
    maxSlots: 1,
    hint: 'One plastic, one colour, and no way to change either during a print. '
      + 'The safe default for a machine with one extruder.',
  },
  {
    id: 'manual',
    name: 'Pause and change by hand',
    materialsVary: true,
    coloursVary: true,
    manual: true,
    maxSlots: null,
    hint: 'The same one extruder, but the print pauses at a chosen layer and '
      + 'somebody swaps the spool. Any colour and, at a push, any plastic — and '
      + 'every change costs a person standing at the machine.',
  },
  {
    id: 'multicolour',
    name: 'Multi-colour',
    materialsVary: false,
    coloursVary: true,
    manual: false,
    maxSlots: null,
    hint: 'Several spools feeding one hotend. Any colour you like — but all of '
      + 'them have to be the same plastic, because one hotend has one temperature.',
  },
  {
    id: 'multimaterial',
    name: 'Multi-material',
    materialsVary: true,
    coloursVary: true,
    manual: false,
    maxSlots: null,
    hint: 'Independent tool heads, each with its own hotend, so different '
      + 'plastics can be printed in the same job.',
  },
];

/** Named fallback, never positional. */
export function colourMode(printerSpec) {
  return COLOUR_MODES.find((m) => m.id === printerSpec?.colourMode)
    || COLOUR_MODES.find((m) => m.id === 'single');
}

/**
 * How many spools a print on this machine can draw on.
 *
 * For a machine that holds several at once this is what is physically loaded.
 * For a pause-and-change machine it is NOT: only one spool is ever loaded, and
 * the limit is how many swaps somebody is prepared to stand there and do —
 * which is what `maxColours` records.
 */
export function slotLimit(printerSpec) {
  const mode = colourMode(printerSpec);
  if (mode.maxSlots) return mode.maxSlots;
  if (mode.manual) return Math.max(1, Math.round(num(printerSpec?.maxColours, 1)));
  return Math.max(1, Math.round(num(printerSpec?.colourSlots, 1)));
}

const printer = (spec) => ({
  archived: false,
  verified: false,
  colourMode: 'single',
  /** Machine seconds one filament change costs. Not labour: nobody is there. */
  changeSeconds: 0,
  /**
   * Printing hours to recover the machine's cost over, if you want it paid off
   * faster than it wears out. null spreads the capital over the full expected
   * life instead - the gentlest rate, and how it worked before this existed.
   */
  paybackHoursOverride: null,
  ...spec,
});

/**
 * `flowRate` is the sustained volumetric rate in mm3/s, which is what actually
 * bounds print time - not the headline mm/s, which no machine holds through a
 * corner. `speed` is kept because people compare on it.
 */
export const DEFAULT_PRINTERS = [
  printer({
    id: 'bambu-x1e',
    name: 'Bambu Lab X1E',
    make: 'Bambu Lab',
    colourMode: 'multicolour',
    // One hotend has to retract, cut, load and purge the next colour before it
    // can carry on. Seconds, but on a model that changes every layer it is the
    // difference between a two-hour print and a four-hour one. A starting
    // value: time your own and correct it.
    changeSeconds: 25,
    purchasePrice: 46000,
    purchaseDate: '2025-03-01',
    residualValue: 6000,
    serviceLifeYears: 6,
    hoursPerYear: 1500,
    lifetimeHoursOverride: null,
    maintenancePerYear: 2500,
    replacementPartsPerYear: 1800,
    overheadPerHour: 1.2,
    powerW: 350,
    heatupPowerW: 900,
    heatupMinutes: 8,
    idlePowerW: 18,
    build: { x: 256, y: 256, z: 256 },
    speed: 500,
    flowRate: 24,
    materials: ['PLA', 'PLA-CF', 'PETG', 'ABS', 'ASA', 'TPU', 'PA-CF', 'PC'],
    colourSlots: 4,
    maxColours: 16,
    setupMinutes: 6,
    failureRate: 0.03,
    notes: 'Enclosed and actively heated, so it is the only shipped machine that '
      + 'can be trusted with ASA, PC and filled nylons.',
  }),
  printer({
    id: 'snapmaker-u1',
    name: 'Snapmaker U1',
    make: 'Snapmaker',
    colourMode: 'multimaterial',
    // A toolchanger only has to put one head down and pick another up: the next
    // filament is already loaded and already hot.
    changeSeconds: 6,
    purchasePrice: 16000,
    purchaseDate: '2025-11-01',
    residualValue: 2000,
    serviceLifeYears: 6,
    hoursPerYear: 1200,
    lifetimeHoursOverride: null,
    maintenancePerYear: 1200,
    replacementPartsPerYear: 900,
    overheadPerHour: 0.8,
    powerW: 220,
    heatupPowerW: 600,
    heatupMinutes: 6,
    idlePowerW: 12,
    build: { x: 300, y: 250, z: 300 },
    speed: 500,
    flowRate: 20,
    materials: ['PLA', 'PLA-CF', 'PETG', 'ABS', 'ASA', 'TPU'],
    colourSlots: 4,
    maxColours: 4,
    setupMinutes: 8,
    failureRate: 0.05,
    notes: 'Independent tool heads, so a colour change costs a tool change '
      + 'rather than a purge. Check the build volume against your unit.',
  }),
  printer({
    id: 'ender-3',
    name: 'Creality Ender-3',
    make: 'Creality',
    colourMode: 'single',
    changeSeconds: 0,
    purchasePrice: 4500,
    purchaseDate: '2023-06-01',
    residualValue: 500,
    serviceLifeYears: 5,
    hoursPerYear: 800,
    lifetimeHoursOverride: null,
    maintenancePerYear: 600,
    replacementPartsPerYear: 400,
    overheadPerHour: 0.5,
    powerW: 120,
    heatupPowerW: 320,
    heatupMinutes: 6,
    idlePowerW: 8,
    build: { x: 220, y: 220, z: 250 },
    speed: 80,
    flowRate: 8,
    materials: ['PLA', 'PETG', 'TPU'],
    colourSlots: 1,
    maxColours: 6,
    setupMinutes: 18,
    failureRate: 0.12,
    notes: 'Open frame and manually levelled. The cheap machine-hour is real, '
      + 'but so are the setup minutes and the failure rate - which is exactly '
      + 'why the comparison has to be done on the finished part.',
  }),
];

/** Total hours the machine is expected to run before it is retired. */
export function lifetimeHours(p) {
  const override = num(p.lifetimeHoursOverride, 0);
  if (override > 0) return override;
  return Math.max(1, num(p.serviceLifeYears) * num(p.hoursPerYear));
}

/**
 * The printing hours the machine's cost is recovered over.
 *
 * Expected LIFE and PAYBACK answer two different questions. Life is how long the
 * machine will physically last; payback is how quickly you want to earn its cost
 * back through the price. A printer good for 2400 h can be priced to pay itself
 * off in the first 500 h of printing - a heavier machine-hour cost now, and
 * after that the same money is margin rather than capital. With no payback set,
 * the capital is spread over the full life, which is the gentlest rate.
 */
export function paybackHours(p) {
  const override = num(p.paybackHoursOverride, 0);
  return override > 0 ? override : lifetimeHours(p);
}

/**
 * The cost of one machine-hour, in four named parts.
 *
 * Electricity is deliberately NOT in here. It is a direct production cost that
 * depends on the tariff and on how long this particular print runs, and putting
 * it in the machine rate would charge it twice - once here and once in the
 * electricity line. One fact, one owner.
 *
 * The capital-recovery part is spread over the PAYBACK hours, not the lifetime:
 * they are the same number until you decide to pay a machine off faster than it
 * wears out, at which point this rate rises to do it.
 */
export function machineHourCost(p) {
  const life = lifetimeHours(p);
  const payback = paybackHours(p);
  const perYear = Math.max(1, num(p.hoursPerYear));

  const depreciation = Math.max(0, num(p.purchasePrice) - num(p.residualValue)) / payback;
  const maintenance = num(p.maintenancePerYear) / perYear;
  const parts = num(p.replacementPartsPerYear) / perYear;
  const overhead = Math.max(0, num(p.overheadPerHour));

  return {
    depreciation,
    maintenance,
    parts,
    overhead,
    total: depreciation + maintenance + parts + overhead,
    lifetimeHours: life,
    paybackHours: payback,
  };
}

/** Does the part fit, in any of the six axis permutations? */
export function fitsBuildVolume(printerSpec, size, { clearance = 0 } = {}) {
  const build = printerSpec?.build || { x: 0, y: 0, z: 0 };
  const need = [num(size?.x), num(size?.y), num(size?.z)]
    .map((v) => v + clearance * 2)
    .sort((a, b) => a - b);
  const have = [num(build.x), num(build.y), num(build.z)].sort((a, b) => a - b);
  const fits = need.every((v, i) => v <= have[i] + 1e-9);

  // The tightest axis, reported so the user is told which one to rotate about
  // rather than just "too big".
  let worst = { axis: null, over: 0 };
  const axes = ['x', 'y', 'z'];
  need.forEach((v, i) => {
    const over = v - have[i];
    if (over > worst.over) worst = { axis: axes[i], over };
  });

  return { fits, needSorted: need, haveSorted: have, worstOver: worst.over };
}

/** Can this machine run this material at all? */
export function supportsMaterial(printerSpec, materialType) {
  if (!printerSpec || !materialType) return true;
  const list = printerSpec.materials || [];
  return list.length === 0 || list.includes(materialType);
}

/** Named fallback, never positional. */
export function findPrinter(printers, id) {
  return printers.find((p) => p.id === id)
    || printers.find((p) => p.id === 'bambu-x1e')
    || printers[0];
}

/** Cheapest machine-hour first. A view, not a stored ranking. */
export function byMachineHourCost(printers) {
  return [...printers].sort((a, b) => machineHourCost(a).total - machineHourCost(b).total);
}
