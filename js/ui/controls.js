/**
 * Form controls, sections and readouts.
 *
 * Three rules, each of which cost time somewhere before it was written down:
 *
 *   Every control carries a `data-field` name. That is what lets scroll, focus
 *   and caret survive the rebuild an edit causes (pitfalls #21), and it is the
 *   handle a verification pass uses to drive the real control rather than
 *   setting state behind its back.
 *
 *   Nothing commits on `input`. Committing mid-interaction re-renders, which
 *   replaces the element being interacted with, and a slider drag dies on the
 *   first pixel. The readout beside a slider follows the thumb live; the value
 *   is written on `change`.
 *
 *   A control never silently rewrites the value it was handed. Ranges use
 *   `step="any"` and round in the handler, so a press that moves nothing
 *   changes nothing.
 */

import { el, infoIcon } from './dom.js';
import { num, fmtMoney, fmtRate } from '../money.js';

/* ------------------------------------------------------------- sections -- */

let sectionStore = {
  get: () => undefined,
  set: () => {},
};

export function configureSections(store) {
  sectionStore = store;
}

/**
 * A folding section.
 *
 * `open` is the INITIAL state only. A state the reader has actually chosen
 * always wins, or the panel folds itself away on every click (pitfalls #14) -
 * which needs the store's getter to report "never set" rather than filling in a
 * default of its own.
 */
export function section(id, title, children, { open = true, info = null, actions = null } = {}) {
  const remembered = sectionStore.get(id);
  const showing = remembered === undefined ? open : Boolean(remembered);

  const body = el('div', { class: 'section__body' }, children);
  body.hidden = !showing;

  const chevron = el('span', { class: 'section__chevron', 'aria-hidden': 'true', text: '▾' });
  const button = el('button', {
    class: 'section__toggle',
    type: 'button',
    'aria-expanded': String(showing),
    'data-field': `section-${id}`,
    on: {
      click: () => {
        const next = body.hidden;
        body.hidden = !next;
        button.setAttribute('aria-expanded', String(next));
        chevron.classList.toggle('is-closed', !next);
        sectionStore.set(id, next);
      },
    },
  }, [chevron, el('span', { text: title }), info ? infoIcon(info) : null]);

  if (!showing) chevron.classList.add('is-closed');

  return el('section', { class: 'section' }, [
    el('div', { class: 'section__head' }, [button, actions ? el('div', { class: 'section__actions' }, actions) : null]),
    body,
  ]);
}

/** Quieter than a section on purpose, so the hierarchy reads at a glance. */
export function subsection(title, children, { hint = null } = {}) {
  return el('div', { class: 'subsection' }, [
    el('h4', { class: 'subsection__title', text: title }),
    hint ? el('p', { class: 'subsection__hint', text: hint }) : null,
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

/* --------------------------------------------------------------- fields -- */

function wrap(label, control, { info, hint, suffix } = {}) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return el('div', { class: 'field' }, [
    el('label', { class: 'field__label', for: id }, [label, info ? infoIcon(info) : null]),
    suffix
      ? el('div', { class: 'field__row' }, [control, el('span', { class: 'field__suffix', text: suffix })])
      : control,
    hint ? el('div', { class: 'field__hint', text: hint }) : null,
  ]);
}

/**
 * A number field.
 *
 * Commits on `change`, which fires on blur and on Enter - not on every
 * keystroke. Rejects junk by leaving the previous value alone rather than
 * writing NaN into the model.
 */
export function numberField(key, label, value, onChange, options = {}) {
  const {
    min = null, max = null, step = 'any', info, hint, suffix, decimals = null, disabled = false,
  } = options;

  const shown = decimals != null && Number.isFinite(num(value))
    ? num(value).toFixed(decimals)
    : String(value ?? '');

  const input = el('input', {
    class: 'input',
    type: 'number',
    'data-field': key,
    value: shown,
    step,
    min: min ?? null,
    max: max ?? null,
    disabled: disabled || null,
    on: {
      change: (e) => {
        const raw = e.target.value;
        if (raw === '') { onChange(null); return; }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) { e.target.value = shown; return; }
        let next = parsed;
        if (min != null) next = Math.max(min, next);
        if (max != null) next = Math.min(max, next);
        onChange(next);
      },
    },
  });
  return wrap(label, input, { info, hint, suffix });
}

export function textField(key, label, value, onChange, options = {}) {
  const { info, hint, placeholder, multiline = false, rows = 3 } = options;
  const input = el(multiline ? 'textarea' : 'input', {
    class: multiline ? 'input input--area' : 'input',
    'data-field': key,
    value: value ?? '',
    placeholder: placeholder || null,
    rows: multiline ? rows : null,
    type: multiline ? null : 'text',
    on: { change: (e) => onChange(e.target.value) },
  });
  if (multiline) input.value = value ?? '';
  return wrap(label, input, { info, hint });
}

export function selectField(key, label, options, value, onChange, extras = {}) {
  const node = el('select', {
    class: 'select',
    'data-field': key,
    disabled: extras.disabled || null,
    on: { change: (e) => onChange(e.target.value) },
  });
  for (const option of options) {
    node.appendChild(el('option', {
      value: String(option.value),
      text: option.label,
      disabled: option.disabled || null,
    }));
  }
  node.value = String(value);
  // A select handed a value it has no option for shows the first one, which is
  // a lie. Say so instead.
  if (node.value !== String(value) && options.length) {
    node.prepend(el('option', { value: String(value), text: `${value} (not in the list)` }));
    node.value = String(value);
  }
  return wrap(label, node, extras);
}

export function checkField(key, label, checked, onChange, options = {}) {
  const input = el('input', {
    type: 'checkbox',
    'data-field': key,
    class: 'check',
    on: { change: (e) => onChange(e.target.checked) },
  });
  input.checked = Boolean(checked);
  return el('div', { class: 'field field--check' }, [
    el('label', { class: 'check__label' }, [
      input,
      el('span', { text: label }),
      options.info ? infoIcon(options.info) : null,
    ]),
    options.hint ? el('div', { class: 'field__hint', text: options.hint }) : null,
  ]);
}

/**
 * A slider with a live readout.
 *
 * `input` updates only the readout; `change` commits. `step="any"` keeps the
 * range from snapping the value onto its own grid behind the reader's back -
 * the rounding is applied to what a drag produced, in the handler.
 */
export function sliderField(key, label, value, onChange, options = {}) {
  const {
    min = 0, max = 100, step = 1, format = (v) => String(v), info, hint,
  } = options;

  const readout = el('span', { class: 'slider__value value', text: format(num(value)) });
  const input = el('input', {
    class: 'slider',
    type: 'range',
    'data-field': key,
    min,
    max,
    step: 'any',
    value: String(num(value)),
    on: {
      input: (e) => { readout.textContent = format(snap(Number(e.target.value), step, min)); },
      change: (e) => onChange(snap(Number(e.target.value), step, min)),
    },
  });

  return el('div', { class: 'field' }, [
    el('label', { class: 'field__label', for: input.id || (input.id = `f-${key}`) }, [
      label, info ? infoIcon(info) : null, readout,
    ]),
    input,
    hint ? el('div', { class: 'field__hint', text: hint }) : null,
  ]);
}

const snap = (value, step, min) => {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round((value - min) / step) * step + min;
};

/** A percentage stored as a fraction but typed as a percentage. */
export function percentField(key, label, fraction, onChange, options = {}) {
  return numberField(key, label, Math.round(num(fraction) * 10000) / 100, (v) => {
    onChange(v == null ? 0 : v / 100);
  }, { min: 0, step: 0.1, suffix: '%', ...options });
}

export function moneyField(key, label, value, onChange, currencyCode, options = {}) {
  return numberField(key, label, value, (v) => onChange(v ?? 0), {
    min: 0, step: 0.01, decimals: 2, suffix: currencyCode, ...options,
  });
}

/* --------------------------------------------------------------- chrome -- */

export function chips(key, options, value, onChange) {
  return el('div', { class: 'chipset', 'data-field': key }, options.map((option) => el('button', {
    class: 'chip',
    type: 'button',
    'data-field': `${key}-${option.value}`,
    'aria-pressed': String(String(option.value) === String(value)),
    title: option.title || null,
    text: option.label,
    on: { click: () => onChange(option.value) },
  })));
}

export function button(label, onClick, options = {}) {
  const { primary = false, key = null, danger = false, title = null, disabled = false, pressed = null } = options;
  return el('button', {
    class: `btn${primary ? ' btn-primary' : ''}${danger ? ' btn-danger' : ''}`,
    type: 'button',
    'data-field': key || `btn-${String(label).toLowerCase().replace(/\W+/g, '-')}`,
    title,
    disabled: disabled || null,
    'aria-pressed': pressed == null ? null : String(pressed),
    text: label,
    on: { click: onClick },
  });
}

export const buttonRow = (buttons) => el('div', { class: 'btn-row' }, buttons);

/** Levels are named here so a caller cannot pass one that renders as neutral. */
const BANNER_LEVELS = {
  info: 'banner-info',
  ok: 'banner-ok',
  warn: 'banner-warn',
  danger: 'banner-danger',
};

export function banner(level, text, options = {}) {
  const className = BANNER_LEVELS[level];
  if (!className) {
    // pitfalls #15: an unrecognised level must not fall back in silence.
    throw new Error(`banner("${level}") is not a level this app renders`);
  }
  return el('div', { class: `banner ${className}`, role: level === 'danger' ? 'alert' : 'status' }, [
    el('span', { class: 'banner__text', text }),
    options.action || null,
  ]);
}

export const bannerLevels = () => Object.keys(BANNER_LEVELS);

/* -------------------------------------------------------------- readouts -- */

export function statTile(label, value, options = {}) {
  const { hint = null, tone = null, big = false } = options;
  return el('div', { class: `stat${tone ? ` stat--${tone}` : ''}${big ? ' stat--big' : ''}` }, [
    el('div', { class: 'stat__label', text: label }),
    el('div', { class: 'stat__value value', text: value }),
    hint ? el('div', { class: 'stat__hint', text: hint }) : null,
  ]);
}

/**
 * A table.
 *
 * `columns` carry an `align` so numbers line up on the decimal point, which is
 * the whole reason anybody reads a cost breakdown as a table rather than prose.
 */
export function table(columns, rows, options = {}) {
  const head = el('tr', {}, columns.map((c) => el('th', {
    class: c.align === 'right' ? 'is-right' : null,
    text: c.label,
  })));

  const body = rows.map((row) => el('tr', { class: row.className || null }, columns.map((c) => {
    const value = typeof c.get === 'function' ? c.get(row) : row[c.key];
    const cell = el('td', {
      class: [
        c.align === 'right' ? 'is-right' : null,
        c.mono ? 'value' : null,
      ].filter(Boolean).join(' ') || null,
    });
    if (value instanceof Node) cell.appendChild(value);
    else cell.textContent = value == null ? '—' : String(value);
    return cell;
  })));

  return el('div', { class: 'table-wrap' }, [
    el('table', { class: `table${options.compact ? ' table--compact' : ''}` }, [
      el('thead', {}, head),
      el('tbody', {}, body),
      options.foot ? el('tfoot', {}, options.foot) : null,
    ]),
  ]);
}

/** A row of the money breakdown: label, optional note, amount. */
export function costRow(label, amount, currencyCode, options = {}) {
  return el('div', {
    class: `cost-row${options.strong ? ' cost-row--strong' : ''}${options.sub ? ' cost-row--sub' : ''}`,
  }, [
    el('span', { class: 'cost-row__label' }, [
      label,
      options.info ? infoIcon(options.info) : null,
    ]),
    options.note ? el('span', { class: 'cost-row__note', text: options.note }) : null,
    el('span', { class: 'cost-row__amount value', text: fmtMoney(amount, currencyCode) }),
  ]);
}

export const pill = (text, tone = 'info') => el('span', { class: `pill pill--${tone}`, text });

export const muted = (text) => el('p', { class: 'muted', text });

export const rate = (fraction) => fmtRate(fraction);

/** An empty state that says what to do next, not merely that there is nothing. */
export function emptyState(text, action = null) {
  return el('div', { class: 'empty' }, [el('p', { text }), action]);
}
