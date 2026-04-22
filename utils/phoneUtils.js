/**
 * Phone utility functions extracted from background/service-worker.js
 */

/**
 * Normalize a phone number to just digits (strip all non-digit characters).
 * Removes leading 0 for local formats (e.g. Brazilian 0-prefixed numbers).
 * @param {string} raw - Raw phone input
 * @returns {string} Digits only, without leading 0
 */
function normalizePhone(raw) {
  let digits = (raw || '').replace(/\D/g, '');
  // Remove leading 0 (local format) — handles Brazilian 11-digit local numbers
  // max Brazilian format: 55 + DDD(2) + 9-digit = 13 digits; leading 0 adds 1
  if (digits.startsWith('0') && digits.length <= 13) digits = digits.slice(1);
  return digits;
}

/**
 * Check if two phone numbers match, handling country code differences.
 * Matches exact and containment. Does NOT use last-8-digit matching
 * as it can produce false positives between different area codes.
 * @param {string} contactPhone - Phone from contact record
 * @param {string} searchPhone - Phone being searched
 * @returns {boolean} True if phones match
 */
function phoneMatches(contactPhone, searchPhone) {
  const a = normalizePhone(contactPhone);
  const b = normalizePhone(searchPhone);
  if (!a || !b) return false;
  // Exact match
  if (a === b) return true;
  // One contains the other (handles country code differences)
  if (a.endsWith(b) || b.endsWith(a)) return true;
  return false;
}

module.exports = { normalizePhone, phoneMatches };