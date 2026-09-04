/**
 * Picking a material in two steps: the plastic, then the colour.
 *
 * One builder, used by the estimator, by a project's part and by the customer
 * form, so the three cannot drift apart. It resolves the pair back to a
 * catalogue spool and reports honestly when the combination is not stocked -
 * quoting White and printing Red because White was missing is exactly the
 * silent substitution this app exists to avoid.
 */

import { el } from './dom.js';
import { selectField, banner, button, buttonRow, muted } from './controls.js';
import {
  MATERIAL_TYPES, typesInStock, coloursForType, findByTypeAndColour, findMaterial,
  materialType, makeSpoolEntry, pricePerGram, materialLabel, spoolId,
} from '../materials.js';
import { fmtMoney } from '../money.js';

/**
 * @param {object} spec
 * @param {string} spec.keyPrefix           unique per screen, for `data-field`
 * @param {Array}  spec.materials           the catalogue to choose from
 * @param {string} spec.materialId          the spool currently chosen
 * @param {Function} spec.onChange          called with the new spool id
 * @param {string} [spec.expectedType]      what the print profile asks for
 * @param {Function} [spec.onAdd]           given a spool, adds it to the catalogue
 * @param {string} [spec.countryId]         to show the price
 * @param {string} [spec.currencyCode]      the currency that price is in
 * @param {Array}  [spec.allowedTypes]      restrict the plastics on offer
 * @param {boolean} [spec.showDetail]       the plastic's own properties. Off for
 *                                          a customer, who needs the colour and
 *                                          the price, not the density.
 */
export function materialPicker({
  keyPrefix,
  materials,
  materialId,
  onChange,
  expectedType = null,
  onAdd = null,
  countryId = null,
  currencyCode = undefined,
  allowedTypes = null,
  showDetail = true,
  labels = {},
}) {
  const current = findMaterial(materials, materialId);
  const type = current?.type || expectedType || MATERIAL_TYPES[0].id;
  const colour = current?.colour || '';

  const stocked = typesInStock(materials)
    .filter((t) => !allowedTypes || allowedTypes.includes(t.id));
  const types = stocked.length ? stocked : MATERIAL_TYPES;
  const colours = coloursForType(materials, type);

  // Changing the plastic keeps the colour when that colour exists in the new
  // plastic. Somebody switching PLA to PETG almost always wants the same
  // colour, and moving them to Black without a word is the wrong answer.
  const changeType = (nextType) => {
    const keep = findByTypeAndColour(materials, nextType, colour);
    if (keep) { onChange(keep.id, { type: nextType, colour }); return; }
    const available = coloursForType(materials, nextType);
    if (available.length) {
      const first = findByTypeAndColour(materials, nextType, available[0]);
      onChange(first.id, { type: nextType, colour: available[0], colourChanged: colour });
      return;
    }
    onChange(materialId, { type: nextType, colour, missing: true });
  };

  const changeColour = (nextColour) => {
    const hit = findByTypeAndColour(materials, type, nextColour);
    if (hit) onChange(hit.id, { type, colour: nextColour });
  };

  const nodes = [
    el('div', { class: 'field-grid' }, [
      selectField(`${keyPrefix}-material-type`, labels.type || 'Material',
        types.map((t) => ({ value: t.id, label: t.name })),
        type, changeType),
      selectField(`${keyPrefix}-material-colour`, labels.colour || 'Colour',
        colours.length
          ? colours.map((c) => ({ value: c, label: c }))
          : [{ value: '', label: 'none stocked' }],
        colour, changeColour, { disabled: colours.length === 0 }),
    ]),
  ];

  if (showDetail) {
    const spec = materialType(type);
    const perGram = current && countryId ? pricePerGram(current, countryId) : null;
    const detail = [
      `${spec.density} g/cm³`,
      spec.enclosure ? 'needs an enclosure' : null,
      spec.abrasive ? 'abrasive — hardened nozzle' : null,
      spec.hygroscopic ? 'must be dried' : null,
      spec.flexible ? 'flexible' : null,
      perGram != null ? `${fmtMoney(perGram, currencyCode)}/g` : null,
    ].filter(Boolean).join(' · ');
    nodes.push(muted(detail));
  }

  if (expectedType && expectedType !== type) {
    nodes.push(banner('info',
      `This print intent was set up for ${materialType(expectedType).name}. `
      + `${materialType(type).name} will print, but the time and material factors were `
      + 'measured on the other one.'));
  }

  if (current && countryId && pricePerGram(current, countryId) == null) {
    nodes.push(banner('danger',
      `${materialLabel(current)} has no price for this country. Enter one in Catalogues `
      + 'before quoting.'));
  }

  return { nodes, current, type, colour, colours };
}

/**
 * The picker plus a way to add a colour the catalogue does not stock.
 *
 * The added spool is priced from the plain spool of the same plastic and is
 * marked as an estimate, because a colour you have not bought yet has an
 * assumed price rather than a known one.
 */
export function materialPickerWithAdd(spec) {
  const picker = materialPicker(spec);
  if (!spec.onAdd) return picker.nodes;

  const { type } = picker;

  // Colours this app knows about from OTHER plastics. Offering "Orange" for
  // PETG because you stock orange PLA is a reasonable suggestion; inventing a
  // colour nobody sells is not.
  const known = new Set(coloursForType(spec.materials, type));
  const elsewhere = [...new Set(spec.materials
    .filter((m) => !m.archived && !known.has(m.colour))
    .map((m) => m.colour))].sort();

  if (!elsewhere.length) return picker.nodes;

  return [
    ...picker.nodes,
    el('details', { class: 'add-colour' }, [
      el('summary', { class: 'add-colour__summary', text: `Add another colour in ${materialType(type).name}` }),
      el('div', { class: 'add-colour__body' }, [
        muted('Priced from your plain spool of the same plastic and marked as an '
          + 'estimate until you enter what you actually paid.'),
        el('div', { class: 'chipset' }, elsewhere.map((c) => button(c, () => {
          const entry = makeSpoolEntry(type, c);
          spec.onAdd(entry);
        }, { key: `${spec.keyPrefix}-add-${spoolId(type, c)}` }))),
      ]),
    ]),
  ];
}
