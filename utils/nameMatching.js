/**
 * Name matching logic — extracted from background/service-worker.js for unit testing.
 * @param {object} record — Q10 record
 * @param {string} searchName
 * @returns {boolean}
 */
function nameMatches(record, searchName) {
  if (!searchName) return false;
  const search = searchName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const parts = [
    record.Nombres, record.Apellidos,
    record.Primer_nombre, record.Segundo_nombre,
    record.Primer_apellido, record.Segundo_apellido,
    record.Nombre, record.nombre,
    record.Nombre_completo
  ].filter(Boolean);

  const fullName = parts.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (!fullName) return false;
  if (fullName === search) return true;
  if (fullName.includes(search) || search.includes(fullName)) return true;

  const searchWords = search.split(/\s+/).filter(w => w.length > 1);
  const nameWords = fullName.split(/\s+/);
  const allMatch = searchWords.every(sw => nameWords.some(nw => nw.includes(sw) || sw.includes(nw)));

  return allMatch && searchWords.length > 0;
}

module.exports = { nameMatches };
