/**
 * Post-processing: resin by top area, and NFC coding.
 *
 * The resin cost and its labour both scale with the top area, interpolated from
 * a per-cm² rate; curing is unattended time, not labour; NFC coding is a flat
 * time per tag. None of it is multiplied by scrap, because it happens on the
 * finished part.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postProcessing, topAreaCm2 } from '../js/postprocessing.js';

const config = {
  resin: { minutesPerCm2: 0.5, costPerCm2: 0.2, curingMinutes: 15 },
  nfc: { codingMinutes: 2 },
};

test('top area is the footprint in cm², from a bounding box in mm', () => {
  // 60 mm × 40 mm = 2400 mm² = 24 cm².
  assert.equal(topAreaCm2({ x: 60, y: 40, z: 10 }), 24);
});

test('resin cost and labour interpolate from the per-cm² rates', () => {
  const pp = postProcessing({ needsResin: true, areaCm2: 24, nfcCount: 0, config, rate: 120 });
  assert.equal(pp.resinMinutes, 24 * 0.5, '12 minutes at half a minute a cm²');
  assert.equal(pp.resinCost, 24 * 0.2, 'resin material scales with area');
  assert.equal(pp.curingMinutes, 15, 'curing is a flat time');
  // Labour is the resin minutes at the hourly rate: 12 min / 60 * 120 = 24.
  assert.equal(pp.labourCost, (12 / 60) * 120);
  assert.equal(pp.cost, pp.resinCost + pp.labourCost);
});

test('curing time is not counted as labour', () => {
  const pp = postProcessing({ needsResin: true, areaCm2: 10, config, rate: 120 });
  // Labour comes only from the resin minutes, never from the 15 curing minutes.
  assert.equal(pp.labourMinutes, 10 * 0.5);
});

test('a bigger part pays more for its resin, and it scales with area not volume', () => {
  const small = postProcessing({ needsResin: true, areaCm2: 10, config, rate: 120 });
  const big = postProcessing({ needsResin: true, areaCm2: 40, config, rate: 120 });
  assert.equal(big.cost, small.cost * 4, 'four times the area is four times the cost');
});

test('NFC coding is a flat labour time per tag, independent of resin', () => {
  const pp = postProcessing({ needsResin: false, nfcCount: 3, config, rate: 60 });
  assert.equal(pp.nfcMinutes, 6, '3 tags at 2 minutes each');
  assert.equal(pp.labourCost, (6 / 60) * 60);
  assert.equal(pp.resinCost, 0, 'no resin when the part is not marked for it');
  assert.ok(pp.applies);
});

test('nothing marked means nothing added', () => {
  const pp = postProcessing({ needsResin: false, nfcCount: 0, config, rate: 120 });
  assert.equal(pp.cost, 0);
  assert.equal(pp.applies, false);
});
