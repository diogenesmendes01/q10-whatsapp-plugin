/**
<<<<<<< HEAD
 * Name utility — extracted from options/options.js for unit testing.
 * Builds a full name from Q10 person record fields.
 * @param {object} a — Q10 record with name fields
 * @returns {string}
 */
function fullAsesorName(a) {
  return [a.Primer_nombre, a.Segundo_nombre, a.Primer_apellido, a.Segundo_apellido]
    .filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(' ');
}

module.exports = { fullAsesorName };
=======
 * Name utilities - extracted from options.js / sidepanel.js
 */

function fullName(d) {
  if (!d) return '—';
  return [d.Primer_nombre, d.Segundo_nombre, d.Primer_apellido, d.Segundo_apellido]
    .filter(Boolean).join(' ');
}

module.exports = { fullName };
>>>>>>> origin/master
