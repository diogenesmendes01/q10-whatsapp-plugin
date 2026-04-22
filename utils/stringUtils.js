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

function normalizeString(s) {
  if (s == null) return '';
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function containsAllWords(haystack, needle) {
  if (needle == null) return false;
  const norm = normalizeString(needle).trim();
  if (norm === '') return true;
  if (!haystack) return false;
  const h = normalizeString(haystack);
  const words = norm.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return true;
  return words.every(w => h.includes(w) || h.split(/\s+/).some(hw => hw.includes(w) || w.includes(hw)));
}

module.exports = { escHtml, normalizeString, containsAllWords };
