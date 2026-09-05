/**
 * The link a company hands to a customer.
 *
 * It lives in its own file, and that is not fussiness. It was originally
 * exported from the customer form's page module, which runs `init()` when it
 * loads — so Settings importing one function from it booted the customer form
 * on the main page, `document.getElementById('portal')` came back null, and the
 * whole app rendered blank. A module that runs on import can only be imported
 * by the page it belongs to.
 */

import { portalConfig } from '../portal-config.js';

export function portalLink(settings, { internal = false } = {}) {
  const base = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}quote.html`;
  return `${base}#${encodeURIComponent(JSON.stringify(portalConfig(settings, { internal })))}`;
}
