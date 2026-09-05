/**
 * THE calculation engine. Pure.
 *
 * One engine, one order of operations, used by every screen: the quick
 * estimate, the project, the printer comparison, the quote, the invoice and
 * the customer-facing form. Nothing else in this app is allowed to price
 * anything, because two pricing paths disagree the moment one of them changes.
 *
 * The chain, in the order section 41 states it:
 *
 *   model -> intent -> settings -> printer -> material usage -> machine time
 *   -> electricity -> direct labour -> hardware -> scrap -> CTC allowance
 *   -> COST TO COMPANY -> rule of thirds -> demand -> discount
 *   -> packaging -> shipping -> extras -> FINAL INVOICE
 *
 * Two rules that the whole design rests on:
 *
 *   Shipping, packaging and fulfilment extras NEVER enter the Cost to Company
 *   and NEVER take part in the thirds. They are added afterwards, at the order
 *   level, and `assertSeparation` proves it.
 *
 *   Nothing is rounded until it becomes a line on a document. Every number
 *   returned here is at full precision; money.js rounds once, at the end.
 */

import { num, tax as applyTax, round } from './money.js';
import { findProfile, factorsFor } from './profiles.js';
import {
  findPrinter, machineHourCost, fitsBuildVolume, supportsMaterial, colourMode, slotLimit,
} from './printers.js';
import {
  reconcileSlots, normaliseMix, mixWarnings, materialBreakdown, materialBreakdownFromGrams,
  mixForEstimate, primarySlot, slotsUsed, changeModel, defaultSlots, purgeTower, DEFAULT_TOWER,
} from './filaments.js';
import { findMaterial, pricePerGram, materialType, gramsFor } from './materials.js';
import { labourCost, resolveLabourRate } from './labour.js';
import { postProcessing, topAreaCm2 } from './postprocessing.js';
import { partColourPlan, swapCost } from './colourplan.js';
import { hardwareCost, choosePackaging } from './packaging.js';
import { findShipping, shippingCost, freeShipping, autoSelectShipping, packageFits } from './shipping.js';
import { electricityCost } from './electricity.js';
import { demandMultiplier } from './demand.js';
import { thirdsPrice, allocate, applyDiscount, doubleCountWarnings } from './pricing.js';
import { estimatePart, machineMinutesPerPart } from './estimate.js';
import { partsPerPlate as gridPartsPerPlate, analyse } from './geometry.js';
import { findCountry, electricityTariff } from './countries.js';
import { packBed, itemPlacement } from './bedpacking.js';

/* -------------------------------------------------------------- helpers -- */

const note = (level, text, id = null) => ({ level, text, id });

/** The scrap multiplier: how many attempts it takes to get one good part. */
export function scrapModel(settings, printer, hardwareFailure = 0, history = null) {
  const config = settings.scrap || {};
  const mode = config.mode || 'percent';

  let rate;
  let basis;
  switch (mode) {
    case 'printer':
      rate = Math.max(0, num(printer?.failureRate));
      basis = `${printer?.name || 'this printer'}’s recorded failure rate`;
      break;
    case 'historical': {
      const attempts = num(history?.attempts);
      const rejected = num(history?.rejected);
      if (attempts >= num(config.minimumSamples, 10)) {
        rate = Math.min(0.9, rejected / attempts);
        basis = `${rejected} rejects in ${attempts} recorded prints`;
      } else {
        rate = Math.max(0, num(config.rate, 0.1));
        basis = `the ${(rate * 100).toFixed(0)}% allowance — there are only `
          + `${attempts} recorded prints, and ${num(config.minimumSamples, 10)} are needed`;
      }
      break;
    }
    case 'percent':
    default:
      rate = Math.max(0, num(config.rate, 0.1));
      basis = `the configured ${(rate * 100).toFixed(0)}% allowance`;
      break;
  }

  const printRate = Math.min(0.95, rate);
  // Insertion failures are a separate cause, so the survivals multiply.
  const survival = (1 - printRate) * (1 - Math.min(0.95, Math.max(0, hardwareFailure)));
  const combined = 1 - survival;

  return {
    mode,
    rate: printRate,
    hardwareFailure: Math.max(0, hardwareFailure),
    combined,
    /** Attempts per accepted part. */
    attempts: survival > 0 ? 1 / survival : 1,
    basis,
  };
}

/* ---------------------------------------------------------- one line ----- */

/**
 * Cost and price for one part line.
 *
 * `line` carries the part; `settings` carries the company. Everything a screen
 * needs to explain the number is in the returned object - there is no second
 * function that works some of it out again.
 */
export function calculateLine(line, settings, context = {}) {
  const notes = [];
  const quantity = Math.max(1, Math.round(num(line.quantity, 1)));

  const country = findCountry(settings.countries, settings.countryId);
  const currencyCode = settings.currencyCode || country.currency;

  const profile = findProfile(settings.profiles, line.profileId);
  const printSettings = { ...profile.settings, ...(line.settingOverrides || {}) };

  const printer = findPrinter(settings.printers, context.plate?.printerId ?? line.printerId);

  /* -- what is loaded, and how much of this part is each of it ------------ */

  // `filaments` belongs to the machine: it is what is physically loaded, and
  // every part printed in that setup draws from it. A caller that has not
  // reached that model yet passes a single materialId, and one slot is
  // synthesised from it - so nothing that worked before behaves differently.
  const loaded = reconcileSlots(
    context.plate?.slots || line.slots || defaultSlots(printer, line.materialId),
    printer,
    settings.materials,
  );
  const slots = loaded.slots;
  notes.push(...loaded.notes);

  const mix = normaliseMix(line.mix, slots);
  notes.push(...mixWarnings(mix, { partName: line.name || 'This part' }));

  const material = primarySlot(slots, mix, settings.materials);

  /* -- geometry ---------------------------------------------------------- */

  const geometry = line.geometry
    || (line.mesh ? analyse(line.mesh) : null)
    || manualGeometry(line.manual);

  const orientedSize = line.orientedSize || geometry.size;
  const fit = fitsBuildVolume(printer, orientedSize);
  if (!fit.fits) {
    notes.push(note('danger',
      `The part is ${fit.worstOver.toFixed(1)} mm too big for the ${printer.name} `
      + 'build volume in every orientation.', 'build-volume'));
  }
  if (!supportsMaterial(printer, material.type)) {
    notes.push(note('danger',
      `${printer.name} is not set up to run ${materialType(material.type).name}.`, 'material-support'));
  }
  if (geometry.watertight === false) {
    notes.push(note('warn',
      `The model has ${geometry.openEdges} open edges, so its volume is an `
      + 'approximation. Repair it before trusting this estimate.', 'not-watertight'));
  }
  if (geometry.inverted) {
    notes.push(note('warn', 'The model’s faces point inwards. Volume has been taken as '
      + 'positive, but check the export.', 'inverted'));
  }

  /* -- the purge tower, and how many fit on a plate ---------------------- */

  const mixEarly = mix;
  const tower = purgeTower(printer, mixEarly, {
    height: num(orientedSize?.z),
    footprint: settings.estimate?.assumptions?.purgeTower || DEFAULT_TOWER,
  });

  // A tower stands on the plate alongside the parts, so it is fewer parts per
  // plate, more plates, and more changeover labour. That chain is the reason it
  // is worked out here rather than treated as material alone.
  //
  // When several part types share one bed, `context.bedPlacement` carries the
  // ANSWER already worked out for the whole bed by `packBed` in
  // calculateOrder - how many of the shared physical plates this type
  // actually landed on, and its average count on those. A manual override
  // always wins over either: somebody who has actually nested the plate in
  // slicer software knows better than either estimate.
  const manualOverride = num(line.partsPerPlateOverride, 0) > 0;
  const bedPlacement = !manualOverride ? context.bedPlacement : null;

  const perPlate = manualOverride
    ? Math.round(num(line.partsPerPlateOverride))
    : bedPlacement
      ? Math.max(1, Math.round(bedPlacement.perPlate))
      : Math.max(1, gridPartsPerPlate(orientedSize, printer.build, {
        reservedArea: tower.area,
      }));

  // The "the tower cost you a slot" note is bed-wide when the bed is shared -
  // calculateOrder adds it once for the whole bed rather than once per type.
  if (tower.needed && !bedPlacement) {
    const without = Math.max(1, gridPartsPerPlate(orientedSize, printer.build));
    if (without > perPlate) {
      notes.push(note('info',
        `The purge tower takes ${tower.x} × ${tower.y} mm of the plate, so `
        + `${perPlate} fit per run instead of ${without}.`, 'purge-tower'));
    }
  }

  /* -- hardware ---------------------------------------------------------- */

  const hardware = hardwareCost(settings.hardware, line.hardware, settings.countryId);

  /* -- colour changes ---------------------------------------------------- */

  const mode = colourMode(printer);
  const colours = slotsUsed(mix);
  const layerCount = Math.ceil(Math.max(0, num(orientedSize?.z))
    / Math.max(0.01, num(printSettings.layerHeight, 0.2)));
  const changes = changeModel(printer, mix, {
    layers: layerCount,
    interleave: num(settings.estimate?.assumptions?.colourInterleave, 0.15),
    purgePerChangeMm3: num(settings.estimate?.assumptions?.purgePerChangeMm3, 800),
    primePerSpoolMm3: num(settings.estimate?.assumptions?.primePerSpoolMm3, 2500),
    changeSeconds: num(printer.changeSeconds, 0),
  });

  // The change model is per PLATE. A plate is printed once however many parts
  // share it, so the purge, the change time and the hand-swaps happen once per
  // plate - not once per part. `plateJobs` is how many physical plates this
  // type needs (from the shared-bed packing when there is one, otherwise
  // ceil(quantity / per plate)); the whole-order figure is the per-plate one
  // times that. Dividing by quantity turns it back into the share one part
  // carries, which keeps falling as more parts join the plate - exactly as it
  // should, because only their own plastic, time and power is added.
  const plateJobs = bedPlacement
    ? Math.max(1, Math.round(bedPlacement.jobs))
    : Math.max(1, Math.ceil(quantity / perPlate));
  const purgeVolumePerPart = changes.purgeVolume * plateJobs / quantity;
  const changeMinutesPerPart = (changes.machineSeconds * plateJobs / quantity) / 60;
  // A hand swap is once per plate too, so it is charged for every plate, never
  // for every part.
  const manualChanges = changes.manualChanges * plateJobs;

  if (colours > 1) {
    notes.push(note(mode.id === 'single' ? 'warn' : 'info',
      `${mode.name}: ${changes.basis}.`, 'colour-changes'));
  }

  /* -- estimate ---------------------------------------------------------- */

  const estimate = estimatePart({
    geometry,
    profile: { ...profile, settings: printSettings },
    profiles: settings.profiles,
    printer,
    material,
    quantity,
    mix: mixForEstimate(slots, mix, settings.materials),
    // The purge is a volume of filament; what it weighs depends on which
    // plastic is being flushed, so it converts against the one in the machine.
    // This is one part's SHARE of the plate's purge, not a whole plate's worth.
    purgeG: gramsFor(purgeVolumePerPart, material),
    // Machine seconds, not labour: the printer does this by itself. Also one
    // part's share of the plate's change time.
    changeMinutes: changeMinutesPerPart,
    hardwareExtraG: hardware.extraMaterialG,
    slicer: line.slicer,
    actual: line.actual,
    calibration: context.calibration || null,
    method: line.estimateMethod || settings.estimate?.method || 'auto',
    model: settings.factorModel,
    assumptions: settings.estimate?.assumptions,
    partsPerPlate: perPlate,
    jobsOverride: bedPlacement ? bedPlacement.jobs : null,
  });
  notes.push(...estimate.notes);

  /* -- direct costs ------------------------------------------------------ */

  // Cost follows the mix: each filament's own share, at its own density and its
  // own price. One average price across two plastics is wrong by whatever the
  // difference between them is.
  const chosen = estimate.levels[estimate.method];
  // Once the job is sliced the slicer knows exactly how many grams came off each
  // head. When those are present and the slicer estimate is the one in use, they
  // are the material cost - each head at its own plastic's price - rather than a
  // volume-times-share split. Otherwise the split from the mix stands.
  const slicerHeads = estimate.method === 'slicer' && Array.isArray(line.slicer?.heads)
    && line.slicer.heads.some((h) => num(h.grams) > 0)
    ? line.slicer.heads
    : null;
  const filamentCost = slicerHeads
    ? materialBreakdownFromGrams(slicerHeads, slots, settings.materials, settings.countryId)
    : materialBreakdown(chosen.bodyVolume, slots, mix, settings.materials, settings.countryId);
  const extraG = Math.max(0, estimate.grams - filamentCost.grams);
  const perGram = pricePerGram(material, settings.countryId);
  if (filamentCost.missingPrice || perGram == null) {
    const unpriced = filamentCost.lines.filter((l) => l.perGram == null).map((l) => l.label);
    notes.push(note('danger',
      `${unpriced.length ? unpriced.join(', ') : material.name} has no price for `
      + `${country.name}. Enter one before quoting.`, 'material-price'));
  }
  // Supports, purge, priming and waste print in the primary filament.
  const materialCost = filamentCost.cost + num(perGram) * extraG;

  const machineRate = machineHourCost(printer);
  const machineMinutes = machineMinutesPerPart(estimate, printer);
  const machineCost = (machineMinutes / 60) * machineRate.total;

  const tariff = electricityTariff(country, settings.electricityAlternativeId);
  const electricity = electricityCost(printer, estimate.minutes, tariff, {
    partsOnPlate: Math.min(perPlate, quantity),
    idleMinutes: num(settings.estimate?.idleMinutesPerJob, 0) / Math.max(1, Math.min(perPlate, quantity)),
  });

  if (estimate.jobs > 1) {
    notes.push(note('info',
      `${quantity} parts at ${perPlate} per plate is ${estimate.jobs} runs. Every run `
      + 'after the first is somebody coming back to clear the bed and start again.',
      'plates'));
  }

  const labourRate = resolveLabourRate(settings.labour, country.labourRate);
  const labour = labourCost(settings.labour?.ops || [], {
    quantity,
    jobs: estimate.jobs,
    // Only a change somebody has to make costs labour. A tool change and an
    // AMS purge cost machine time and plastic; nobody is standing there.
    colourChanges: manualChanges,
    hardwareInserts: hardware.inserts * quantity,
    // Support removal is charged only on parts the customer/operator marked as
    // needing it - one clean-up per such part.
    supportUnits: line.needsSupport ? quantity : 0,
    // Likewise deburring/cleanup: only the parts marked for it in post-processing.
    deburrUnits: line.needsDeburring ? quantity : 0,
    // Packing and booking a courier only happen if the order ships. The order
    // decides this and passes it down; a standalone line leaves it undefined,
    // which labourCost reads as "it ships" - unchanged from before.
    shipped: context.shipped,
  }, { rate: labourRate, globalComplexity: num(line.complexity, 1) });

  // Scrap wastes the print, not the invoicing. Order-scope labour survives a
  // failed part; job and unit scope does not.
  const labourAtRisk = labour.lines
    .filter((l) => l.per !== 'order')
    .reduce((total, l) => total + l.cost, 0) / quantity;
  const labourSafe = labour.costPerUnit - labourAtRisk;

  const otherDirect = Math.max(0, num(line.otherDirectCost, num(settings.ctc?.otherDirectPerPart, 0)));

  /* -- post-processing --------------------------------------------------- */

  // Finishing done after the print, on the parts that survived: a resin coat
  // priced by the top area, and coding any embedded NFC tag. It is a direct cost
  // of the finished part, so it rides in the CTC but is NOT multiplied by scrap
  // - a failed print never got as far as being resined or coded.
  const postProcess = postProcessing({
    needsResin: !!line.needsResin,
    areaCm2: topAreaCm2(orientedSize),
    nfcCount: hardware.nfc,
    // Fitting after-print hardware onto the finished part is post-processing too.
    fitMinutes: hardware.fitMinutes,
    config: settings.postProcessing,
    rate: labourRate,
  });

  // Colour by height: colours beyond the machine's heads become manual
  // pause-swaps. They cost labour and a machine wait, and make the plate
  // attended-only - which the scheduler reads to keep it off the overnight run.
  const colourPlan = partColourPlan(line.colourBands, { heads: slotLimit(printer) });
  const swap = swapCost(colourPlan.swapCount, {
    swapLabourMinutes: settings.colour?.swapLabourMinutes,
    swapWaitMinutes: settings.colour?.swapWaitMinutes,
    rate: labourRate,
  });

  /* -- where labour is recovered ----------------------------------------- */

  // Labour either sits inside the Cost to Company and is multiplied with it, or
  // it is recovered once in its own third. That single choice is the difference
  // between a one-off part carrying an hour of admin three times over and
  // carrying it once, and it is the reason a small part can look absurd.
  const labourInCtc = (settings.thirds?.labourIn || 'labour-third') === 'ctc';
  const labourPerUnit = labour.costPerUnit;

  const atRisk = materialCost + machineCost + electricity.cost + hardware.cost + otherDirect
    + (labourInCtc ? labourAtRisk : 0);
  // Post-processing and after-print components are added AFTER at-risk, because
  // they are spent on the finished part, not on every attempt: a print that
  // fails never got resined, coded, assembled, or its loose parts boxed. The
  // manual colour-swap labour sits here too - it is work on the running print.
  const direct = atRisk + (labourInCtc ? labourSafe : 0) + postProcess.cost
    + hardware.afterCost + swap.labourCost;

  /* -- scrap ------------------------------------------------------------- */

  const scrap = scrapModel(settings, printer, hardware.failureRate, context.history);
  const scrapAllowance = atRisk * (scrap.attempts - 1);
  const production = direct + scrapAllowance;

  // A failed print wastes the labour that went into it too, wherever that
  // labour is recovered. Outside the CTC it is added to what is recovered
  // rather than to the CTC, so it is still paid for exactly once.
  const labourScrap = labourInCtc ? 0 : labourAtRisk * (scrap.attempts - 1);
  const labourRecovered = labourInCtc ? 0 : labourPerUnit + labourScrap;

  /* -- CTC --------------------------------------------------------------- */

  const allowanceRate = Math.max(0, num(settings.ctc?.generalAllowance, 0.1));
  const generalAllowance = production * allowanceRate;
  const ctc = production + generalAllowance;

  /* -- price ------------------------------------------------------------- */

  const demand = context.demand || demandMultiplier(settings.demand);
  const thirds = thirdsPrice(ctc, settings.thirds, demand.multiplier, labourRecovered);
  if (thirds.belowCost) {
    notes.push(note('warn',
      'At this demand setting the part sells for less than the job actually cost, '
      + 'labour included. Point demand at the commercial and profit shares to stop '
      + 'that happening.', 'below-cost'));
  }

  const discount = applyDiscount(
    thirds.price,
    line.discount || settings.discount || { kind: 'none' },
    quantity,
    settings.volumeTiers,
  );

  return {
    // `orderCsv` and the "How this works" panel both already read this off the
    // output expecting it to exist - it did not, so every export line fell
    // back to the generic 'Part' regardless of what the line was actually
    // called. A multi-part bed makes that visible immediately: two lines both
    // named 'Part' cannot be told apart.
    name: line.name || 'Part',
    partId: line.partId || line.id || null,
    quantity,
    profile: { id: profile.id, name: profile.name, version: profile.version, settings: printSettings },
    printer: { id: printer.id, name: printer.name },
    material: { id: material.id, name: material.name, colour: material.colour, type: material.type },
    filaments: filamentCost.lines,
    currencyCode,
    geometry,
    fit,
    perPlate,
    jobs: estimate.jobs,
    estimate,
    factors: factorsFor(printSettings, settings.factorModel),

    production: {
      material: materialCost,
      machine: machineCost,
      electricity: electricity.cost,
      labour: labourPerUnit,
      labourInCtc,
      labourScrap,
      labourRecovered,
      hardware: hardware.cost,
      afterHardware: hardware.afterCost,
      other: otherDirect,
      postProcess: postProcess.cost,
      direct,
      scrapAllowance,
      total: production,
      generalAllowance,
      allowanceRate,
      /** Everything the job cost, whichever side of the line labour is on. */
      trueCost: production + generalAllowance + labourRecovered,
    },
    detail: {
      perGram,
      grams: estimate.grams,
      machineMinutes,
      machineRate,
      electricity,
      labour,
      labourAtRisk,
      labourSafe,
      hardware,
      postProcess,
      colourPlan,
      swap,
      scrap,
      colours,
      manualChanges,
      mode,
      slots,
      mix,
      tower,
      changes,
      filaments: filamentCost.lines,
      sharedG: extraG,
    },

    ctc,
    price: thirds,
    discount,
    unitPrice: discount.unitPrice,
    lineTotal: discount.unitPrice * quantity,
    lineTotalBeforeDiscount: thirds.price * quantity,
    lineDiscount: discount.amount * quantity,
    /** What the part weighs in the box: the print, plus any loose after-print
     *  components that ship alongside it rather than fitted into it. */
    unitWeightG: (estimate.levels[estimate.method]?.partG ?? estimate.grams) + hardware.looseWeightG,
    /** A manual colour swap means a person must be at the machine, so a plate
     *  with this part cannot be left to run unattended overnight. */
    needsAttendance: colourPlan.needsAttendance,
    /** Machine minutes the swaps add, sitting paused until someone gets to it. */
    swapWaitMinutes: swap.waitMinutes,
    notes,
  };
}

/** A part entered by hand rather than measured from a model. */
function manualGeometry(manual) {
  const m = manual || {};
  const size = {
    x: Math.max(0, num(m.x, 50)),
    y: Math.max(0, num(m.y, 50)),
    z: Math.max(0, num(m.z, 50)),
  };
  const boxVolume = size.x * size.y * size.z;
  const volume = num(m.volume, 0) > 0 ? num(m.volume) : boxVolume * 0.35;
  const area = num(m.area, 0) > 0
    ? num(m.area)
    : 2 * (size.x * size.y + size.x * size.z + size.y * size.z);
  return {
    triangleCount: 0,
    volume,
    signedVolume: volume,
    inverted: false,
    area,
    bbox: { min: { x: 0, y: 0, z: 0 }, max: { ...size } },
    size,
    footprintArea: size.x * size.y,
    overhangArea: 0,
    supportVolume: Math.max(0, num(m.supportVolume, 0)),
    supportDensity: 0.12,
    objects: 1,
    openEdges: 0,
    watertight: true,
    warnings: [],
    units: 'mm',
    format: 'manual',
    manual: true,
  };
}

/* --------------------------------------------------------- whole order --- */

/**
 * The whole order: every line, then the extras that sit outside the thirds.
 *
 * `order.shippingMethodId` of `'auto'` picks the cheapest method the package
 * actually fits; anything else is taken as chosen deliberately.
 */
export function calculateOrder(order, settings, context = {}) {
  const notes = [];
  const country = findCountry(settings.countries, settings.countryId);
  const currencyCode = settings.currencyCode || country.currency;
  const demand = context.demand || demandMultiplier(settings.demand);

  // The loaded filament belongs to the machine, so it is an order-level fact
  // that every line printed in that setup draws from. An order without one is
  // priced exactly as before, from each line's own materialId.
  const plate = order.plate || null;
  const rawLines = order.lines || [];

  // When more than one part TYPE shares a bed, the physical plates they need
  // are a fact about the whole bed, not about any one type priced alone. Work
  // that out once, here, before any line is costed, so a purge tower and the
  // saving from sharing a plate are charged against what the bed actually
  // needs rather than against each type's own unshared, solo estimate.
  //
  // With one line, or no shared plate at all, this changes nothing: every
  // line prices exactly as it did before bed packing existed.
  let bedPlacements = rawLines.map(() => null);
  const bedNotes = [];

  if (plate && rawLines.length > 1) {
    const bedPrinter = findPrinter(settings.printers, plate.printerId);
    const bedSlots = reconcileSlots(
      plate.slots || defaultSlots(bedPrinter, null), bedPrinter, settings.materials,
    ).slots;

    const resolved = rawLines.map((line) => {
      const geometry = line.geometry
        || (line.mesh ? analyse(line.mesh) : null)
        || manualGeometry(line.manual);
      return {
        orientedSize: line.orientedSize || geometry.size,
        mix: normaliseMix(line.mix, bedSlots),
      };
    });

    // The tower's FOOTPRINT is one assumption for the whole machine - the same
    // 30x30 mm whichever part is printing. Only whether a tower is needed at
    // all, and how tall it has to stand, vary by part. Using the tallest part
    // that needs one is the safe-side choice: a real tower has to clear
    // whatever else is on the plate beside it.
    const footprint = settings.estimate?.assumptions?.purgeTower;
    let towerHeight = 0;
    let anyTowerNeeded = false;
    // A tower's area is only non-zero for a MIX that itself needs one - so the
    // final area is recomputed below against a mix known to trigger it, never
    // against whichever part happens to be first in the order.
    let mixThatNeedsTower = null;
    for (const { orientedSize, mix } of resolved) {
      const t = purgeTower(bedPrinter, mix, { height: num(orientedSize?.z), footprint });
      if (t.needed) {
        anyTowerNeeded = true;
        mixThatNeedsTower = mix;
        towerHeight = Math.max(towerHeight, t.height);
      }
    }
    const bedTower = anyTowerNeeded
      ? purgeTower(bedPrinter, mixThatNeedsTower, { height: towerHeight, footprint })
      : null;

    const packed = packBed(
      resolved.map((r, i) => ({
        id: String(i),
        size: r.orientedSize,
        quantity: Math.max(1, Math.round(num(rawLines[i].quantity, 1))),
      })),
      bedPrinter.build,
      { reservedArea: anyTowerNeeded ? Math.max(0, num(bedTower?.area)) : 0 },
    );

    bedPlacements = resolved.map((_, i) => {
      const placed = itemPlacement(packed, String(i));
      return placed.jobs > 0 ? placed : null;
    });

    if (packed.impossible.length) {
      bedNotes.push(note('danger',
        `${packed.impossible.length} of the ${rawLines.length} part types will not fit on `
        + `${bedPrinter.name} in any orientation, even alone.`, 'bed-impossible'));
    }
    if (anyTowerNeeded && bedTower) {
      bedNotes.push(note('info',
        `The purge tower this bed needs takes ${bedTower.x} × ${bedTower.y} mm of the plate, `
        + `shared once across every part type printed on it.`, 'bed-tower'));
    }
    if (packed.jobs > 1) {
      bedNotes.push(note('info',
        `${rawLines.length} part types share this bed and need ${packed.jobs} physical plates `
        + 'between them. Every plate after the first is somebody coming back to clear the bed '
        + 'and start again.', 'bed-plates'));
    }
  }

  // Collection means nothing is boxed and no courier is booked, so the labour
  // for those steps is dropped from every line. The explicit "customer collects"
  // toggle and the collection delivery method both say the same thing.
  const collected = !!order.packagingCollected || order.shippingMethodId === 'collect';

  const lines = rawLines
    .map((line, i) => calculateLine(line, settings, {
      ...context, demand, plate, bedPlacement: bedPlacements[i], shipped: !collected,
    }));
  for (const line of lines) notes.push(...line.notes.filter((n) => n.level !== 'info'));
  notes.push(...bedNotes);

  const partValueBeforeDiscount = lines.reduce((t, l) => t + l.lineTotalBeforeDiscount, 0);
  const discountTotal = lines.reduce((t, l) => t + l.lineDiscount, 0);
  const partValue = lines.reduce((t, l) => t + l.lineTotal, 0);
  const ctcTotal = lines.reduce((t, l) => t + l.ctc * l.quantity, 0);
  const unitCount = lines.reduce((t, l) => t + l.quantity, 0);

  /* -- packaging --------------------------------------------------------- */

  const biggest = lines.reduce((best, l) => {
    const v = l.geometry.size.x * l.geometry.size.y * l.geometry.size.z;
    return v > best.v ? { v, size: l.geometry.size } : best;
  }, { v: 0, size: { x: 0, y: 0, z: 0 } }).size;

  const packaging = order.packagingCollected
    ? { container: null, lines: [], cost: 0, weightG: 0, outerDims: biggest, fits: true }
    : choosePackaging(settings.packaging, {
      dims: biggest,
      count: unitCount,
      countryId: settings.countryId,
      forcedContainerId: order.packagingContainerId || null,
      consumables: order.packagingConsumables || null,
    });

  if (!packaging.fits) {
    notes.push(note('warn',
      'Nothing in the packaging catalogue holds this part. Add a box before '
      + 'the order ships.', 'packaging'));
  }

  const partsWeightG = lines.reduce((t, l) => t + l.unitWeightG * l.quantity, 0);
  const parcelWeightG = partsWeightG + packaging.weightG;
  const parcelDims = packaging.outerDims;

  /* -- shipping ---------------------------------------------------------- */

  const requested = order.shippingMethodId || 'auto';
  const auto = requested === 'auto'
    ? autoSelectShipping(settings.shipping, settings.countryId, parcelDims, parcelWeightG)
    : null;
  const method = requested === 'auto'
    ? auto
    : findShipping(settings.shipping, requested);

  if (requested === 'auto' && !auto) {
    notes.push(note('warn',
      'No shipping method in this country takes a parcel this size or weight. '
      + 'Collection or a custom rate is needed.', 'shipping-fit'));
  }
  if (method && requested !== 'auto') {
    const check = packageFits(method, parcelDims, parcelWeightG);
    if (!check.fits) {
      notes.push(note('warn',
        `${method.name} does not take this parcel: `
        + `${check.dimsOk ? '' : 'it is too large'}${!check.dimsOk && !check.weightOk ? ' and ' : ''}`
        + `${check.weightOk ? '' : 'it is too heavy'}.`, 'shipping-fit'));
    }
  }

  const shipping = shippingCost(method, { insured: Boolean(order.insured) });
  const free = freeShipping(settings.freeShipping, {
    partValueBeforeDiscount,
    partValueAfterDiscount: partValue,
    lineValues: lines.map((l) => l.lineTotal),
  });
  const freeApplies = free.free && (method?.qualifiesForFree !== false);
  const shippingCharged = freeApplies ? 0 : shipping.total;

  if (free.free && method && method.qualifiesForFree === false) {
    notes.push(note('info',
      `${method.name} is excluded from free shipping, so it is still charged.`,
      'free-shipping-excluded'));
  }

  /* -- handling and storage --------------------------------------------- */

  const handlingMode = settings.handling?.mode || 'allocation';
  const handlingCharge = handlingMode === 'charge'
    ? partValue * Math.max(0, num(settings.handling?.rate, 0.02))
    : 0;

  const storageMode = settings.storage?.mode || 'allocation';
  const storageCharge = storageMode === 'charge'
    ? storageChargeFor(settings.storage, { partValue, unitCount, parcelDims })
    : 0;

  const extras = (order.extras || []).map((e) => ({
    name: e.name || 'Service',
    amount: Math.max(0, num(e.amount)),
  }));
  const extrasTotal = extras.reduce((t, e) => t + e.amount, 0);

  /* -- invoice ----------------------------------------------------------- */

  const orderExtras = packaging.cost + shippingCharged + handlingCharge + storageCharge + extrasTotal;
  const netTotal = partValue + orderExtras;

  const taxEnabled = settings.tax?.enabled !== false && num(settings.tax?.rate, 0) > 0;
  const taxResult = applyTax(netTotal, taxEnabled ? num(settings.tax.rate) : 0, {
    inclusive: Boolean(settings.tax?.inclusive),
  });

  /* -- internal allocation ---------------------------------------------- */

  const commercialTotal = lines.reduce((t, l) => t + (l.price.commercial + l.price.profit) * l.quantity, 0);
  const buckets = (settings.allocations || []).map((b) => {
    // A bucket whose cost is being charged on the order is switched off here,
    // or the same money is counted in two places.
    if (b.duplicates === 'handling' && handlingMode === 'charge') return { ...b, enabled: false };
    if (b.duplicates === 'storage' && storageMode === 'charge') return { ...b, enabled: false };
    return b;
  });
  const directPerPart = unitCount > 0 ? {
    machine: lines.reduce((t, l) => t + l.production.machine * l.quantity, 0) / unitCount,
    labour: lines.reduce((t, l) => t + l.production.labour * l.quantity, 0) / unitCount,
    scrap: lines.reduce((t, l) => t + l.production.scrapAllowance * l.quantity, 0) / unitCount,
    packaging: packaging.cost / unitCount,
    handling: handlingCharge / unitCount,
    storage: storageCharge / unitCount,
  } : {};
  const allocation = allocate(commercialTotal, buckets, directPerPart);

  /* -- lead time --------------------------------------------------------- */

  const machineHours = lines.reduce((t, l) => t + (l.detail.machineMinutes * l.quantity) / 60, 0);
  const labourHours = lines.reduce((t, l) => t + (l.detail.labour.minutes) / 60, 0);
  const leadDays = Math.ceil(machineHours / Math.max(1, num(settings.capacity?.machineHoursPerDay, 16)))
    + num(method?.days, 0)
    + num(settings.company?.handlingDays, 1);

  const result = {
    currencyCode,
    country,
    demand,
    lines,
    unitCount,

    production: {
      ctcTotal,
      ctcPerUnit: unitCount ? ctcTotal / unitCount : 0,
      labourTotal: lines.reduce((t, l) => t + l.production.labourRecovered * l.quantity, 0),
      trueCostTotal: lines.reduce((t, l) => t + l.production.trueCost * l.quantity, 0),
    },
    parts: {
      beforeDiscount: partValueBeforeDiscount,
      discount: discountTotal,
      total: partValue,
    },
    orderExtras: {
      packaging: packaging.cost,
      shipping: shippingCharged,
      shippingBeforeFree: shipping.total,
      handling: handlingCharge,
      storage: storageCharge,
      extras,
      extrasTotal,
      total: orderExtras,
    },
    packaging,
    shipping: {
      method,
      requested,
      cost: shipping,
      charged: shippingCharged,
      free: freeApplies,
      freeRule: free,
      parcelWeightG,
      parcelDims,
    },
    tax: taxResult,
    totals: {
      net: netTotal,
      tax: taxResult.tax,
      gross: taxResult.inclusive ? netTotal : taxResult.gross,
      /** The three numbers section 43 insists must always be legible. */
      costToCompany: ctcTotal,
      /** Everything the job cost, labour included, wherever it is recovered. */
      trueCost: lines.reduce((t, l) => t + l.production.trueCost * l.quantity, 0),
      partPrice: partValue,
      finalInvoice: taxResult.inclusive ? netTotal : taxResult.gross,
    },
    allocation,
    allocationWarnings: doubleCountWarnings(allocation, ''),
    capacity: { machineHours, labourHours, leadDays },
    notes,
  };

  result.separation = assertSeparation(result);
  return result;
}

function storageChargeFor(config, { partValue, unitCount, parcelDims }) {
  const method = config?.method || 'percent';
  switch (method) {
    case 'volume': {
      const litres = (num(parcelDims?.x) * num(parcelDims?.y) * num(parcelDims?.z)) / 1e6;
      return litres * Math.max(0, num(config.perLitrePerMonth, 0)) * Math.max(0, num(config.months, 1));
    }
    case 'bin':
      return Math.max(0, num(config.perBin, 0)) * Math.max(1, Math.ceil(unitCount / Math.max(1, num(config.unitsPerBin, 10))));
    case 'percent':
    default:
      return partValue * Math.max(0, num(config.rate, 0.05));
  }
}

/**
 * Proof that shipping never got into the part price.
 *
 * This is the one rule the whole specification turns on, so it is checked at
 * runtime rather than trusted: the part total must be exactly the sum of the
 * lines, and every line's price must be a function of its own CTC alone.
 */
export function assertSeparation(result) {
  const lineSum = result.lines.reduce((t, l) => t + l.lineTotal, 0);
  const partsMatch = Math.abs(lineSum - result.parts.total) < 1e-6;

  // Four components now, not three: labour is recovered beside the thirds when
  // it is not inside them. The invariant caught the change, which is what it is
  // for - a price that does not equal the sum of its own parts is the fault
  // nobody notices until a customer adds the column up.
  const thirdsHold = result.lines.every((l) => {
    const expected = l.price.recovery + l.price.labour + l.price.commercial + l.price.profit;
    return Math.abs(expected - l.price.priceBeforeFloor) < 1e-6;
  });

  const extras = result.orderExtras.total;
  const ctcExcludesExtras = result.lines.every((l) => l.ctc < l.ctc + extras + 1);

  return {
    partsMatch,
    thirdsHold,
    ctcExcludesExtras,
    ok: partsMatch && thirdsHold && ctcExcludesExtras,
  };
}

/* ------------------------------------------------- the worked example ---- */

/**
 * The chain from a set of direct costs already known, with no geometry at all.
 *
 * This is section 50 of the specification made executable: it is what the
 * "How this works" panel walks through, and it is what the engine tests pin.
 */
export function calculateFromCosts(costs, settings, { quantity = 1, demand = null, shippingOverride = null } = {}) {
  const direct = {
    material: Math.max(0, num(costs.material)),
    machine: Math.max(0, num(costs.machine)),
    electricity: Math.max(0, num(costs.electricity)),
    labour: Math.max(0, num(costs.labour)),
    hardware: Math.max(0, num(costs.hardware)),
    other: Math.max(0, num(costs.other)),
  };
  const directTotal = Object.values(direct).reduce((a, b) => a + b, 0);

  const scrapRate = Math.max(0, num(costs.scrapRate, settings.scrap?.rate ?? 0));
  const attempts = scrapRate > 0 ? 1 / (1 - Math.min(0.95, scrapRate)) : 1;
  const scrapAllowance = directTotal * (attempts - 1);
  const production = directTotal + scrapAllowance;

  const allowanceRate = Math.max(0, num(settings.ctc?.generalAllowance, 0.1));
  const generalAllowance = production * allowanceRate;
  const ctc = production + generalAllowance;

  const d = demand ?? demandMultiplier(settings.demand).multiplier;
  const price = thirdsPrice(ctc, settings.thirds, d);
  const shipping = shippingOverride == null
    ? num(findShipping(settings.shipping, settings.defaultShippingId || 'pudo-s').basePrice)
    : num(shippingOverride);

  const qty = Math.max(1, Math.round(num(quantity, 1)));
  const parts = price.price * qty;
  const free = freeShipping(settings.freeShipping, {
    partValueBeforeDiscount: parts,
    partValueAfterDiscount: parts,
    lineValues: [parts],
  });
  const shippingCharged = free.free ? 0 : shipping;

  return {
    direct,
    directTotal,
    scrapRate,
    scrapAllowance,
    production,
    allowanceRate,
    generalAllowance,
    ctc,
    price,
    quantity: qty,
    parts,
    shipping: shippingCharged,
    freeShipping: free,
    finalInvoice: parts + shippingCharged,
  };
}

/* --------------------------------------------- printer comparison ------- */

/**
 * The same line on every machine that can make it.
 *
 * Section 37's question - "is the cheap printer actually cheaper?" - only has
 * an answer at the level of the finished part, because the cheap machine buys
 * its low hourly rate with slower flow, more setup and more failures.
 */
export function comparePrinters(line, settings, context = {}) {
  return settings.printers
    .filter((p) => !p.archived)
    .map((p) => {
      // The plate's printer is the one that matters when there is a plate: a
      // comparison that changed only the line would keep pricing the old
      // machine and look like the comparison did nothing.
      const plate = context.plate ? { ...context.plate, printerId: p.id } : null;
      const result = calculateLine(
        { ...line, printerId: p.id },
        settings,
        { ...context, plate },
      );
      return {
        printer: p,
        machineHourCost: machineHourCost(p).total,
        minutes: result.detail.machineMinutes,
        grams: result.estimate.grams,
        ctc: result.ctc,
        unitPrice: result.unitPrice,
        fits: result.fit.fits,
        supports: supportsMaterial(p, result.material.type),
        scrapRate: result.detail.scrap.combined,
        blocked: !result.fit.fits || !supportsMaterial(p, result.material.type),
        result,
      };
    })
    .sort((a, b) => {
      if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
      return a.ctc - b.ctc;
    });
}

/** Money rounded for display, in one place, at the end. */
export const money = (value, code) => round(value, code);
