/**
 * Electricity. Pure.
 *
 * Three consumptions that are genuinely different and are commonly collapsed
 * into one: bringing the bed and hotend up to temperature (brief, heavy),
 * printing (long, moderate), and sitting powered but idle between jobs (long,
 * light). The heat-up is shared across everything on the plate, which is one
 * more reason a full plate is cheaper per part than a single print.
 */

import { num } from './money.js';

export function energyKWh(printer, printMinutes, { idleMinutes = 0, partsOnPlate = 1 } = {}) {
  const parts = Math.max(1, num(partsOnPlate, 1));

  const heatupHours = Math.max(0, num(printer?.heatupMinutes)) / 60;
  const heatup = (Math.max(0, num(printer?.heatupPowerW)) / 1000) * heatupHours / parts;

  const printing = (Math.max(0, num(printer?.powerW)) / 1000) * Math.max(0, num(printMinutes)) / 60;
  const idle = (Math.max(0, num(printer?.idlePowerW)) / 1000) * Math.max(0, num(idleMinutes)) / 60;

  return { heatup, printing, idle, total: heatup + printing + idle };
}

/** Cost of one part's share of the electricity. */
export function electricityCost(printer, printMinutes, tariff, options = {}) {
  const kwh = energyKWh(printer, printMinutes, options);
  const rate = Math.max(0, num(tariff));
  return {
    ...kwh,
    tariff: rate,
    cost: kwh.total * rate,
    heatupCost: kwh.heatup * rate,
    printingCost: kwh.printing * rate,
    idleCost: kwh.idle * rate,
  };
}
