/**
 * Chrome, routing and the render loop.
 *
 * There is one render path: an edit rebuilds the sidebar and the main region.
 * That is what stops the state and the screen drifting apart, and it costs two
 * things the browser was holding on the reader's behalf - where the panel was
 * scrolled to, and which control had focus with the caret where. Both are
 * captured before the teardown and restored after (pitfalls #21), which needs
 * every control to carry a stable `data-field` name.
 */

import { el, clear, toast, download } from './ui/dom.js';
import { capDiagramScale, captureFocus, restoreFocus, dualLabel } from './ui/patterns.js';
import { configureSections } from './ui/controls.js';
import {
  state, load, save, saveSoon, sectionStore, exportAll, importFile, resetAll, MODES,
} from './state.js';
import { applyPreset as applyPresetTo } from './settings.js';
import {
  restoreSync, subscribeSync, checkForChanges, syncState, syncNeedsPermission,
  reconnectSync, loadFromFile, keepMine,
} from './ui/sync.js';

import * as estimate from './ui/tools/estimate.js';
import * as projects from './ui/tools/projects.js';
import * as catalogues from './ui/tools/catalogues.js';
import * as inventory from './ui/tools/inventory.js';
import * as documents from './ui/tools/documents.js';
import * as dashboard from './ui/tools/dashboard.js';
import * as guide from './ui/tools/guide.js';
import * as scheduler from './ui/tools/scheduler.js';
import * as settingsTool from './ui/tools/settings.js';

/** Read this before investigating anything: a stale cache wastes more time
 *  than any bug in this app has. "Reload the app" in the footer clears it. */
export const APP_VERSION = '1.0.0';

const TOOLS = [estimate, projects, catalogues, inventory, documents, dashboard, scheduler, guide, settingsTool];

const dom = {};

/* ---------------------------------------------------------------- theme -- */

function applyTheme() {
  if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
}

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' };
// A glyph per theme, so the control reports its state without a word of text:
// half-filled for "follow the system", a sun for light, a moon for dark.
const THEME_GLYPH = { system: '◐', light: '☀', dark: '☾' };

/* --------------------------------------------------------------- header -- */

function buildHeader() {
  const fileInput = el('input', {
    type: 'file',
    class: 'visually-hidden',
    accept: '.json',
    'data-field': 'open-file',
    on: {
      change: async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const report = importFile(await file.text(), { merge: true });
        if (!report.ok) toast(report.error);
        else {
          toast(`Opened ${report.projects} project${report.projects === 1 ? '' : 's'}`
            + `${report.skipped ? `, skipped ${report.skipped}` : ''}`);
          state.tool = 'projects';
        }
        e.target.value = '';
        render();
      },
    },
  });

  return el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('img', { class: 'brand__logo', src: 'assets/logo.png', alt: 'Detronics' }),
      el('span', { class: 'brand__sep', 'aria-hidden': 'true' }),
      el('span', { class: 'brand__tool', text: '3DPrintCost Bench' }),
    ]),
    el('div', { class: 'header-actions' }, [
      el('button', {
        class: 'btn',
        type: 'button',
        'data-field': 'open',
        title: 'Open a saved workshop or project file',
        on: { click: () => fileInput.click() },
      }, dualLabel('Open', 'Open')),
      el('button', {
        class: 'btn',
        type: 'button',
        'data-field': 'save-file',
        title: 'Save everything to a file on this device',
        on: {
          click: () => {
            download(new Blob([exportAll()], { type: 'application/json' }),
              `3d-printing-bench-${new Date().toISOString().slice(0, 10)}.json`);
            state.ui.lastBackupAt = Date.now();
            saveSoon();
            toast('Saved to your downloads');
            render();
          },
        },
      }, dualLabel('Save all', 'Save')),
      el('button', {
        class: 'btn btn-icon',
        type: 'button',
        'data-field': 'theme',
        // The glyph carries no meaning to a screen reader, so the state lives in
        // the accessible name and the tooltip instead.
        'aria-label': `Theme: ${THEME_LABEL[state.theme]} — click to change`,
        title: `Theme: ${THEME_LABEL[state.theme]} (system, light or dark)`,
        on: {
          click: () => {
            state.theme = THEME_ORDER[(THEME_ORDER.indexOf(state.theme) + 1) % THEME_ORDER.length];
            applyTheme();
            saveSoon();
            render();
          },
        },
      }, [el('span', { 'aria-hidden': 'true', text: THEME_GLYPH[state.theme] })]),
      fileInput,
    ]),
  ]);
}

function buildModes() {
  return el('div', { class: 'chipset chipset--modes', role: 'group', 'aria-label': 'Detail level' },
    MODES.map((mode) => el('button', {
      class: 'chip',
      type: 'button',
      'data-field': `mode-${mode.id}`,
      title: mode.hint,
      'aria-pressed': String(state.mode === mode.id),
      text: mode.name,
      on: {
        click: () => {
          state.mode = mode.id;
          saveSoon();
          render();
        },
      },
    })));
}

function buildTabs() {
  return el('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Workspaces' },
    TOOLS.map((tool) => el('button', {
      class: `segmented__btn${state.tool === tool.id ? ' is-active' : ''}`,
      type: 'button',
      role: 'tab',
      'data-field': `tab-${tool.id}`,
      'aria-selected': String(state.tool === tool.id),
      on: {
        click: () => {
          state.tool = tool.id;
          saveSoon();
          render();
        },
      },
    }, [
      el('span', { class: 'tab-label tab-label--long', text: tool.name }),
      el('span', { class: 'tab-label tab-label--short', text: tool.short }),
    ])));
}

/**
 * Tabs and the detail level on one row.
 *
 * They were split between the header and the viewport until a 375px check
 * showed the header could not hold the brand as well: the logo shrank to
 * nothing and the theme button ran off the right edge.
 */
function buildWorkspaceBar() {
  return el('div', { class: 'workspace-bar' }, [buildTabs(), buildModes()]);
}

function buildFooter() {
  return el('footer', { class: 'app-footer' }, [
    el('span', {
      text: 'Everything runs in your browser. No analytics, no cookies, nothing '
        + 'uploaded — your models, prices and customers stay on this device.',
    }),
    el('nav', {}, [
      el('button', {
        class: 'linkish',
        type: 'button',
        'data-field': 'force-refresh',
        text: 'Reload the app',
        title: 'Fetch every file again, ignoring the browser cache',
        on: { click: forceRefresh },
      }),
      el('button', {
        class: 'linkish',
        type: 'button',
        'data-field': 'reset-all',
        text: 'Reset everything',
        on: {
          click: () => {
            if (!window.confirm('This clears every project, customer and setting on this '
              + 'device. Save a file first if you want them back.')) return;
            resetAll();
            render();
            toast('Reset to defaults');
          },
        },
      }),
      el('span', { class: 'muted', text: `v${APP_VERSION}` }),
    ]),
  ]);
}

/**
 * Fetch everything again, ignoring the browser cache, and reload.
 *
 * This app has no build step, so its files are served under fixed names and a
 * browser will happily keep an old copy of a module for a long time. That is
 * the single most expensive failure mode here: an afternoon spent debugging
 * something that was fixed and simply not delivered. The version in the footer
 * is how you spot it; this is how you fix it without opening developer tools.
 *
 * The list is taken from what the page actually loaded rather than written out
 * by hand, so it cannot fall behind the code.
 */
async function forceRefresh() {
  const urls = new Set([location.href.split('#')[0]]);
  for (const entry of performance.getEntriesByType('resource')) {
    if (/\.(js|css|svg|png)(\?|$)/.test(entry.name)) urls.add(entry.name);
  }
  toast(`Fetching ${urls.size} files again…`);
  await Promise.all([...urls].map((url) => fetch(url, { cache: 'reload' }).catch(() => {})));
  location.reload();
}

/* ------------------------------------------------------- backup reminder -- */

let backupDismissed = false;

/**
 * A gentle nudge to keep a file backup.
 *
 * The whole workshop lives in one browser's localStorage, which a cleared cache
 * or a wrong click can wipe. There is no server to fall back on, so the only
 * durable copy is a file the person saves themselves - and it is worth reminding
 * them, but only when there is something to lose and the last backup is old.
 */
function saveBackup() {
  download(new Blob([exportAll()], { type: 'application/json' }),
    `3d-printing-bench-${new Date().toISOString().slice(0, 10)}.json`);
  state.ui.lastBackupAt = Date.now();
  saveSoon();
  toast('Saved to your downloads');
  render();
}

function backupReminder() {
  if (backupDismissed) return null;
  if (!(state.projects.length || state.customers.length)) return null;
  const last = state.ui.lastBackupAt;
  if (last && Date.now() - last < 14 * 24 * 60 * 60 * 1000) return null;

  return el('div', { class: 'banner banner-warn backup-reminder' }, [
    el('span', {
      text: last
        ? `Your last file backup was ${new Date(last).toLocaleDateString()}. Everything here `
          + 'lives only in this browser — save a file so a cleared cache cannot lose it.'
        : 'Your workshop lives only in this browser. Save a backup file so a cleared cache or a '
          + 'wrong click can never lose it.',
    }),
    el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-primary', type: 'button', 'data-field': 'backup-now',
        text: 'Save all now', on: { click: saveBackup },
      }),
      el('button', {
        class: 'btn', type: 'button', 'data-field': 'backup-dismiss',
        text: 'Later', on: { click: () => { backupDismissed = true; render(); } },
      }),
    ]),
  ]);
}

/* ---------------------------------------------------------- team sync -- */

/**
 * The one place a sync conflict or a permission re-grant is resolved, shown at
 * the top of every tool so it cannot be missed. Everything else about sync is
 * managed in Settings; only the thing that needs a decision surfaces here.
 */
function syncBanner() {
  const s = syncState();
  if (!s.connected) return null;

  if (syncNeedsPermission()) {
    return el('div', { class: 'banner banner-warn backup-reminder' }, [
      el('span', {
        text: `Reconnect “${s.name}” to resume team sync — the browser needs your `
          + 'permission again after a restart.',
      }),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button', 'data-field': 'sync-reconnect',
          text: 'Reconnect', on: { click: async () => { await reconnectSync(); render(); } },
        }),
      ]),
    ]);
  }

  if (s.conflict) {
    return el('div', { class: 'banner banner-warn backup-reminder' }, [
      el('span', {
        text: `The shared file “${s.name}” has a version that differs from this one — from a `
          + 'colleague, or another device. Load their version (replaces what is here), or keep '
          + 'yours (overwrites the file).',
      }),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button', 'data-field': 'sync-load',
          text: 'Load their version', on: { click: async () => { await loadFromFile(); render(); } },
        }),
        el('button', {
          class: 'btn btn-danger', type: 'button', 'data-field': 'sync-keep',
          text: 'Keep mine', on: { click: async () => { await keepMine(); render(); } },
        }),
      ]),
    ]);
  }
  return null;
}

/* --------------------------------------------------------------- render -- */

function currentTool() {
  return TOOLS.find((t) => t.id === state.tool) || TOOLS[0];
}

/** What every tool is handed. One shape, so a tool cannot reach past it. */
function context() {
  return {
    state,
    rerender: render,
    save: saveSoon,
    stageSvgs: () => [...dom.main.querySelectorAll('svg[viewBox]')],
    applyPreset: (presetId) => {
      state.settings = applyPresetTo(state.settings, presetId);
      saveSoon();
      render();
    },
    goTo: (tool, ids = {}) => {
      state.tool = tool;
      Object.assign(state, ids);
      saveSoon();
      render();
    },
  };
}

export function render() {
  // The scroll containers a rebuild must not throw away: the sidebar (its own
  // scroller), the viewport (the desktop main scroller), and the page itself
  // (on narrow screens the whole window scrolls instead of the viewport). The
  // one that is not scrolling reports zero, so restoring all three is safe.
  const snapshot = captureFocus({
    sidebar: dom.sidebar,
    viewport: dom.viewport,
    page: document.scrollingElement,
  });
  const tool = currentTool();
  const ctx = context();

  // The header carries the theme label, which reports state. Building it once
  // in init() left it describing the state as it was at page load - a control
  // contradicting the thing it describes. It is rebuilt with everything else.
  clear(dom.header).append(...buildHeader().childNodes);
  clear(dom.tabs).appendChild(buildWorkspaceBar());
  clear(dom.main);
  clear(dom.sidebar);
  clear(dom.explain);

  let mainNodes = [];
  let sidebarNodes = [];
  let explainNodes = [];
  try {
    mainNodes = tool.main(ctx) || [];
    sidebarNodes = tool.sidebar ? (tool.sidebar(ctx) || []) : [];
    // "How this works" is the formulas and assumptions behind the numbers, so
    // it is what Expert adds over Advanced. Simple and Advanced never show it;
    // this is the one thing that makes the third detail level mean something.
    explainNodes = (tool.explain && state.mode === 'expert') ? (tool.explain(ctx) || []) : [];
  } catch (error) {
    // A thrown renderer must not leave a blank page with the reason in a console
    // nobody has open.
    mainNodes = [el('div', { class: 'banner banner-danger' }, [
      el('span', { text: `Something went wrong drawing this screen: ${error.message}` }),
    ])];
    if (typeof console !== 'undefined') console.error(error);
  }

  const sync = syncBanner();
  if (sync) dom.main.appendChild(sync);
  const reminder = backupReminder();
  if (reminder) dom.main.appendChild(reminder);
  for (const node of mainNodes) if (node) dom.main.appendChild(node);
  for (const node of sidebarNodes) if (node) dom.sidebar.appendChild(node);

  if (explainNodes.length) {
    dom.explain.appendChild(el('h2', { class: 'explain__heading', text: 'How this works' }));
    for (const node of explainNodes) if (node) dom.explain.appendChild(node);
    dom.main.appendChild(dom.explain);
  }

  // Renderers size their viewBox to the drawing, so `width: 100%` alone would
  // magnify a small one to fill the panel (pitfalls #3).
  capDiagramScale(dom.main);

  dom.sidebar.hidden = sidebarNodes.length === 0;
  document.body.classList.toggle('no-sidebar', sidebarNodes.length === 0);

  restoreFocus(snapshot, {
    sidebar: dom.sidebar,
    viewport: dom.viewport,
    page: document.scrollingElement,
  });
}

function init() {
  load();
  applyTheme();
  configureSections(sectionStore);

  dom.header = el('header', { class: 'app-header' });
  dom.tabs = el('div', { class: 'workspace-bar-host' });
  dom.main = el('div', { class: 'viewport__body' });
  dom.explain = el('div', { class: 'explain-host' });
  dom.sidebar = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Controls' });
  dom.print = el('div', { class: 'print-host', id: 'print-host' });
  // The main content scrolls inside `.viewport` (desktop) - dom.main itself
  // never scrolls - so it is the viewport whose position a rebuild must keep.
  dom.viewport = el('section', { class: 'viewport' }, [dom.tabs, dom.main]);

  document.body.append(
    dom.header,
    el('main', { class: 'app-main' }, [
      dom.viewport,
      dom.sidebar,
    ]),
    dom.print,
    buildFooter(),
  );

  render();
  save();

  // Team sync: a change from the module (conflict, save, reconnect) redraws;
  // reconnect to the shared file if one was set; and when the tab regains focus,
  // check whether a colleague has changed the file since we last saw it.
  subscribeSync(render);
  restoreSync().then(render);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForChanges();
  });
  window.addEventListener('focus', () => checkForChanges());

  window.addEventListener('hashchange', () => {
    // A share link pasted into the address bar of an open tab must load.
    load();
    applyTheme();
    render();
  });
}

init();
