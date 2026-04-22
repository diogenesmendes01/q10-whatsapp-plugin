/**
 * String escape utility — shared by options.js and sidepanel/sidepanel.js.
 * Escape API-sourced strings before interpolating into innerHTML templates.
 * Q10 catalogs contain client-configured names that may include special
 * characters which could break DOM or open XSS.
 * @param {string} s
 * @returns {string}
 */
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escHtml };
