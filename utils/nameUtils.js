/**
 * Name utility functions extracted from background/service-worker.js
 */

const { normalizeString } = require('./stringUtils');

/**
 * Build full name from a Q10 record's name fields.
 * Returns lowercase, accent-removed (normalized) name for comparison.
 * @param {Object} record - Q10 record with name fields
 * @returns {string} Full normalized name (empty string if no fields)
 */
function fullName(record) {
  if (!record) return '';
  const parts = [
    record.Nombres, record.Apellidos,
    record.Primer_nombre, record.Segundo_nombre,
    record.Primer_apellido, record.Segundo_apellido,
    record.Nombre, record.nombre,
    record.Nombre_completo
  ].filter(Boolean);
  return parts.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Build full name from an array of name parts.
 * Does NOT normalize — preserves original accents for display.
 * @param  {...string} parts - Name parts to join
 * @returns {string} Full name with parts joined by space
 */
function buildFullName(...parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * Check if a Q10 record matches a search name.
 * Handles exact match, containment, and word-by-word matching.
 * Uses normalized (accent-removed, lowercase) names for comparison.
 * @param {Object} record - Q10 record with name fields
 * @param {string} searchName - Name to search for
 * @returns {boolean} True if record matches the search name
 */
function nameMatches(record, searchName) {
  if (!searchName) return false;
  const search = normalizeString(searchName);

  const full = fullName(record);
  if (!full) return false;

  // Exact match
  if (full === search) return true;

  // Full name contains search or search contains full name
  if (full.includes(search) || search.includes(full)) return true;

  // Match by parts: all search words must appear in the full name
  const searchWords = search.split(/\s+/).filter(w => w.length > 1);
  const nameWords = full.split(/\s+/);
  const allMatch = searchWords.every(sw => nameWords.some(nw => nw.includes(sw) || sw.includes(nw)));

  return allMatch && searchWords.length > 0;
}

module.exports = { fullName, buildFullName, nameMatches };