const { fullAsesorName } = require('../utils/nameUtils');

describe('fullAsesorName', () => {
  test('concatenates all four name fields', () => {
    const record = {
      Primer_nombre: 'Juan',
      Segundo_nombre: 'Carlos',
      Primer_apellido: 'Pérez',
      Segundo_apellido: 'García'
    };
    expect(fullAsesorName(record)).toBe('Juan Carlos Pérez García');
  });

  test('handles missing fields gracefully', () => {
    const record = {
      Primer_nombre: 'María',
      Segundo_nombre: null,
      Primer_apellido: 'Silva',
      Segundo_apellido: undefined
    };
    expect(fullAsesorName(record)).toBe('María Silva');
  });

  test('trims whitespace from fields', () => {
    const record = {
      Primer_nombre: '  Ana ',
      Segundo_nombre: 'Luísa ',
      Primer_apellido: ' Costa',
      Segundo_apellido: ''
    };
    expect(fullAsesorName(record)).toBe('Ana Luísa Costa');
  });

  test('returns empty string when all fields are null/empty', () => {
    expect(fullAsesorName({})).toBe('');
    expect(fullAsesorName({ Primer_nombre: null, Segundo_nombre: '', Primer_apellido: null, Segundo_apellido: '' })).toBe('');
  });
});
