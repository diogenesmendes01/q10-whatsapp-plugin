const { normalizePhone, phoneMatches } = require('../utils/phoneUtils');

describe('normalizePhone', () => {
  test('removes non-digits', () => {
    expect(normalizePhone('+55 11 99999-9999')).toBe('5511999999999');
  });
  test('handles null', () => {
    expect(normalizePhone(null)).toBe('');
  });
  test('handles empty', () => {
    expect(normalizePhone('')).toBe('');
  });
});

describe('phoneMatches', () => {
  // Two numbers from different DDDs (11 vs 21) where last 8 match but last 9 differ
  // (11) 97777-8888 = 11977778888 → last 8: 77778888, last 9: 777788888
  // (21) 97777-8888 = 21977778888 → last 8: 77778888, last 9: 777788888
  // Same! So the 9-digit threshold correctly distinguishes them.
  const spMobile = '11977778888';
  const rjMobile = '21977778888';

  // (11) 97777-8889 = 11977778889 → last 9: 777788889
  // (11) 97777-8888 = 11977778888 → last 9: 777788888
  // These differ in the 9th-from-last digit.
  const sameDDDdifferentLastDigit = '11977778889';

  test('exact match', () => {
    expect(phoneMatches(spMobile, spMobile)).toBe(true);
  });

  test('one contains the other', () => {
    expect(phoneMatches('+5511977778888', '11977778888')).toBe(true);
  });

  test('same last 8 but different last 9 digit — 9-digit threshold prevents false positive', () => {
    // Both have last 8 = 77778888, but the 9th-from-last digit differs
    // 9-digit threshold correctly distinguishes these
    expect(phoneMatches(spMobile, sameDDDdifferentLastDigit)).toBe(false);
  });

  test('null inputs return false', () => {
    expect(phoneMatches(null, '11977778888')).toBe(false);
    expect(phoneMatches('11977778888', null)).toBe(false);
  });
});
