/**
 * Post-processing: the finishing that happens AFTER the print. Pure.
 *
 * Two kinds so far, both done on the parts that survived the print rather than
 * on every attempt, which is why their cost is not multiplied by the scrap rate:
 *
 *   resin  a coat over the top surface. Both the resin used and the time to lay
 *          it on scale with the TOP AREA, so the workshop sets a rate per square
 *          centimetre and it is interpolated to the real area of the part. A
 *          fixed curing time follows, which is unattended station time, not
 *          labour - nobody stands over it.
 *
 *   nfc    coding a tag that was embedded during the print. A flat labour time
 *          per tag; the tag itself and its fitting are already priced as
 *          hardware.
 */

import { num } from './money.js';

/**
 * The top area a resin coat covers, in cm², from a part's bounding box in mm.
 *
 * The honest estimate without a mesh is the plan-view footprint - the part laid
 * flat - which is the two horizontal dimensions. mm² converts to cm² by 100.
 */
export function topAreaCm2(size) {
  const x = Math.max(0, num(size?.x));
  const y = Math.max(0, num(size?.y));
  return (x * y) / 100;
}

/**
 * The money and time one part's post-processing adds.
 *
 * `rate` is the hourly labour rate; resin cost is a material cost. Returns both
 * separately, and a `cost` that is the total money added to the finished part.
 */
export function postProcessing({
  needsResin = false, areaCm2 = 0, nfcCount = 0, fitMinutes = 0, config = {}, rate = 0,
} = {}) {
  const resin = config.resin || {};
  const nfc = config.nfc || {};
  const hourly = Math.max(0, num(rate));
  const area = Math.max(0, num(areaCm2));

  const resinOn = !!needsResin && area > 0;
  const resinMinutes = resinOn ? area * Math.max(0, num(resin.minutesPerCm2)) : 0;
  const resinCost = resinOn ? area * Math.max(0, num(resin.costPerCm2)) : 0;
  const curingMinutes = resinOn ? Math.max(0, num(resin.curingMinutes)) : 0;

  const tags = Math.max(0, Math.round(num(nfcCount)));
  const nfcMinutes = tags * Math.max(0, num(nfc.codingMinutes));

  // Fitting after-print hardware (a heat-set insert, a USB light) onto the
  // finished part - the difference between shipping it loose and assembled.
  const assemblyMinutes = Math.max(0, num(fitMinutes));

  const labourMinutes = resinMinutes + nfcMinutes + assemblyMinutes;
  const labourCost = (labourMinutes / 60) * hourly;

  return {
    applies: resinOn || tags > 0 || assemblyMinutes > 0,
    resinOn,
    areaCm2: area,
    resinMinutes,
    resinCost,
    curingMinutes,
    nfcTags: tags,
    nfcMinutes,
    assemblyMinutes,
    labourMinutes,
    labourCost,
    /** Total money added to the finished part: resin material plus the labour. */
    cost: resinCost + labourCost,
  };
}
