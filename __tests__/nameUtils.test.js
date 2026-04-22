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
  });
});
