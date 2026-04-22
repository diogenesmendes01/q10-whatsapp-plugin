const { nameMatches } = require('../utils/nameMatching');

describe('nameMatches', () => {
  describe('exact match', () => {
    test('matches exact full name', () => {
      const record = { Nombres: 'María', Apellidos: 'Silva' };
      expect(nameMatches(record, 'maría silva')).toBe(true);
    });
  });

  describe('partial match', () => {
    test('record full name contains search', () => {
      const record = { Nombre: 'Carlos Andrés Pérez Gómez' };
      expect(nameMatches(record, 'andrés')).toBe(true);
    });

    test('search contains record full name', () => {
      const record = { Nombre: 'Ana' };
      expect(nameMatches(record, 'ana rosa silva')).toBe(true);
    });
  });

  describe('accent normalization', () => {
    test('ignores accents in both record and search', () => {
      const record = { Nombre_completo: 'José Núñez' };
      expect(nameMatches(record, 'Jose Nuñez')).toBe(true);
    });
  });

  describe('no match', () => {
    test('returns false when searchName is empty', () => {
      expect(nameMatches({ Nombre: 'Test' }, '')).toBe(false);
    });

    test('returns false when record has no name fields', () => {
      expect(nameMatches({}, 'john')).toBe(false);
    });

    test('returns false when no search word matches', () => {
      const record = { Nombre: 'Ana Silva' };
      expect(nameMatches(record, 'pedro jose')).toBe(false);
    });
  });
});
