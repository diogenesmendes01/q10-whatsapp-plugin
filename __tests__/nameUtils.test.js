<<<<<<< HEAD
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
=======
const { fullName } = require('../utils/nameUtils');

describe('fullName', () => {
  test('combines all name parts', () => {
    expect(fullName({ Primer_nombre: 'João', Segundo_nombre: 'Silva', Primer_apellido: 'Santos', Segundo_apellido: 'Jr' }))
      .toBe('João Silva Santos Jr');
  });
  test('handles missing parts', () => {
    expect(fullName({ Primer_nombre: 'Maria', Primer_apellido: 'Silva' }))
      .toBe('Maria Silva');
  });
  test('handles null', () => {
    expect(fullName(null)).toBe('—');
  });
  test('handles partial data', () => {
    expect(fullName({ Primer_nombre: 'Ana' })).toBe('Ana');
>>>>>>> origin/master
  });
});
