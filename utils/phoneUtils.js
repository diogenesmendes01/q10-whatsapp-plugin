/**
 * Phone utilities - extracted from background/service-worker.js
 * Normalizes and matches Brazilian phone numbers.
 */

function normalizePhone(raw) {
  if (!raw) return '';
  return (raw + '').replace(/\D/g, '');
}

function phoneMatches(contactPhone, searchPhone) {
  const a = normalizePhone(contactPhone);
  const b = normalizePhone(searchPhone);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(b) || b.endsWith(a)) return true;
  if (a.length >= 9 && b.length >= 9 && a.slice(-9) === b.slice(-9)) return true;
  return false;
}

module.exports = { normalizePhone, phoneMatches };
