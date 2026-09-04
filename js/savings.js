/**
 * What filling a plate saves. Pure (bar the engine it calls).
 *
 * The single most persuasive fact for a customer is that ten of a part cost far
 * less each than one, because the setup, the admin and the plate are shared. So
 * this prices the SAME part at a few quantities - one, a couple of steps, and a
 * full plate - and hands back the per-part price at each, plus the headline
 * saving between one and a full plate. Everything a chart needs, and nothing it
 * does not.
 *
 * The percentage is buffer-independent: a flat quote buffer multiplies every
 * per-part price alike, so the saving between one and a plateful is the same
 * whether or not the customer-facing padding is applied.
 */

import { calculateOrder } from './engine.js';
import { num } from './money.js';

/** A few quantities from 1 to a full plate, without repricing dozens of times. */
export function sampleQuantities(perPlate) {
  const plate = Math.max(1, Math.round(num(perPlate, 1)));
  if (plate <= 1) return [1];
  const out = new Set([1]);
  if (plate >= 4) out.add(Math.round(plate / 2));
  out.add(plate);
  return [...out].sort((a, b) => a - b);
}

export function plateSaving(line, settings, { plate = null } = {}) {
  const priceAt = (quantity) => {
    const result = calculateOrder({ plate, lines: [{ ...line, quantity }] }, settings);
    return result.lines[0];
  };

  const first = priceAt(1);
  const perPlate = Math.max(1, num(first?.perPlate, 1));
  const points = sampleQuantities(perPlate).map((quantity) => {
    const l = quantity === 1 ? first : priceAt(quantity);
    return { quantity, unitPrice: Math.max(0, num(l?.unitPrice)) };
  });

  const one = points[0].unitPrice;
  const full = points[points.length - 1];
  return {
    perPlate,
    points,
    one,
    plateQuantity: full.quantity,
    platePrice: full.unitPrice,
    /** How much cheaper each part is when the plate is full, 0..1. */
    savingPercent: one > 0 ? Math.max(0, (one - full.unitPrice) / one) : 0,
  };
}
