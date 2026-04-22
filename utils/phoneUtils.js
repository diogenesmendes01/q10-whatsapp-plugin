/**
 * Phone utility functions extracted from background/service-worker.js
 * for unit testing.
 */

/**
 * Normalize a phone number to digits only.
 * @param {string} raw
 * @returns {string}
 */
function normalizePhone(raw) {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length <= 11) digits = digits.slice(1);
  return digits;
}

/**
 * Check if two phone numbers match.
 * Handles country code differences and partial matches.
 * @param {string} contactPhone
 * @param {string} searchPhone
 * @returns {boolean}
 */
function phoneMatches(contactPhone, searchPhone) {
  const a = normalizePhone(contactPhone);
  const b = normalizePhone(searchPhone);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(b) || b.endsWith(a)) return true;
  if (a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8)) return true;
  return false;
}

module.exports = { normalizePhone, phoneMatches };
