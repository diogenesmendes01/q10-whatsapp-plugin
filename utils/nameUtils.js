/**
 * Name utilities - extracted from options.js / sidepanel.js
 */

function fullName(d) {
  if (!d) return '—';
  return [d.Primer_nombre, d.Segundo_nombre, d.Primer_apellido, d.Segundo_apellido]
    .filter(Boolean).join(' ');
}

module.exports = { fullName };
