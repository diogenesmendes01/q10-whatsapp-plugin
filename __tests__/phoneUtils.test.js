const { normalizePhone, phoneMatches } = require('../utils/phoneUtils');

describe('normalizePhone', () => {
<<<<<<< HEAD
  test('removes non-digit characters', () => {
    expect(normalizePhone('+55 (19) 98814-5438')).toBe('5519988145438');
  });

  test('removes leading 0 from local format when result is <= 11 digits', () => {
    // 01988145438 → 11 digits → 0 stripped → 1988145438
    expect(normalizePhone('01988145438')).toBe('1988145438');
    // 019988145438 → 12 digits → 0 NOT stripped (condition: <= 11)
    expect(normalizePhone('019988145438')).toBe('019988145438');
  });

  test('handles null/undefined input', () => {
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  test('returns digits only for clean numbers', () => {
    expect(normalizePhone('5519988145438')).toBe('5519988145438');
=======
  test('removes non-digits', () => {
    expect(normalizePhone('+55 11 99999-9999')).toBe('5511999999999');
  });
  test('handles null', () => {
    expect(normalizePhone(null)).toBe('');
  });
  test('handles empty', () => {
    expect(normalizePhone('')).toBe('');
>>>>>>> origin/master
  });
});

describe('phoneMatches', () => {
<<<<<<< HEAD
  describe('exact match', () => {
    test('matches identical numbers', () => {
      expect(phoneMatches('5519988145438', '5519988145438')).toBe(true);
    });

    test('matches identical numbers with formatting', () => {
      expect(phoneMatches('+55 (19) 98814-5438', '+55 19 98814 5438')).toBe(true);
    });
  });

  describe('one contains the other', () => {
    test('contact has country code, search does not', () => {
      expect(phoneMatches('5519988145438', '19988145438')).toBe(true);
    });

    test('search has country code, contact does not', () => {
      expect(phoneMatches('19988145438', '5519988145438')).toBe(true);
    });
  });

  describe('last 8 digits match', () => {
    test('handles different country + area code formats', () => {
      expect(phoneMatches('5519988145438', '88145438')).toBe(true);
    });
  });

  describe('no match', () => {
    // Use numbers that differ in the last 8 digits so none of the
    // contains/ends-with/last-8 fallback heuristics trigger a false match.
    test('returns false for completely different numbers', () => {
      expect(phoneMatches('11988145438', '22988145439')).toBe(false);
    });

    test('returns false when contactPhone is falsy', () => {
      expect(phoneMatches(null, '19988145438')).toBe(false);
    });

    test('returns false when searchPhone is falsy', () => {
      expect(phoneMatches('19988145438', null)).toBe(false);
    });

    // Very short numbers (< 8 digits) should not match via last-8 check.
    // normalizePhone('1234') = '1234' (length 4 < 8) → returns false.
    test('returns false for numbers shorter than 8 digits', () => {
      expect(phoneMatches('123', '456')).toBe(false);
    });
=======
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
>>>>>>> origin/master
  });
});
