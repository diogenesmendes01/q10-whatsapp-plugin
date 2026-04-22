const { normalizePhone, phoneMatches } = require('../utils/phoneUtils');

describe('normalizePhone', () => {
<<<<<<< HEAD
  // Basic normalization
  test('strips all non-digit characters', () => {
    expect(normalizePhone('+55 (11) 99999-1234')).toBe('5511999991234');
    expect(normalizePhone('(11) 9999-1234')).toBe('1199991234');
    expect(normalizePhone('1199991234')).toBe('1199991234');
  });

  test('handles empty input', () => {
    expect(normalizePhone('')).toBe('');
=======
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
>>>>>>> origin/master
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

<<<<<<< HEAD
  test('removes leading 0 from local Brazilian format', () => {
    expect(normalizePhone('011999991234')).toBe('11999991234');
    expect(normalizePhone('0999991234')).toBe('999991234');
  });

  test('keeps 55 country code for Brazilian numbers', () => {
    expect(normalizePhone('+5511999991234')).toBe('5511999991234');
    expect(normalizePhone('551199991234')).toBe('551199991234');
  });

  test('handles international format with 00', () => {
    expect(normalizePhone('005511999991234')).toBe('5511999991234');
  });

  test('Guatemala format (502)', () => {
    expect(normalizePhone('+502 4512 3489')).toBe('50245123489');
    expect(normalizePhone('50245123489')).toBe('50245123489');
  });

  test('handles spaces and dashes', () => {
    expect(normalizePhone('19988145438')).toBe('19988145438');
    expect(normalizePhone('199 8814 5438')).toBe('19988145438');
    expect(normalizePhone('199-8814-5438')).toBe('19988145438');
  });

  test('does not remove leading 0 if number is longer than 13 digits', () => {
    // More than 13 digits — keep the 0 (it may be part of the number)
    expect(normalizePhone('01123344556677')).toBe('01123344556677');
  });

  test('trims to 13-digit max before removing leading 0', () => {
    // 13 digits with leading 0: 0 + 55 + 11 + 999999999 = still stripped
    expect(normalizePhone('055119999912345')).toBe('55119999912345');
=======
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
>>>>>>> origin/master
  });
});

describe('phoneMatches', () => {
<<<<<<< HEAD
  // Exact matches
  test('exact match — same number', () => {
    expect(phoneMatches('11999991234', '11999991234')).toBe(true);
  });

  test('exact match with different formatting', () => {
    expect(phoneMatches('+55 11 99999-1234', '(11) 99999-1234')).toBe(true);
  });

  test('exact match — same with country code', () => {
    expect(phoneMatches('5511999991234', '+5511999991234')).toBe(true);
  });

  // Containment (one ends with the other)
  test('contact has country code, search does not', () => {
    expect(phoneMatches('5511999991234', '11999991234')).toBe(true);
  });

  test('search has country code, contact does not', () => {
    expect(phoneMatches('11999991234', '5511999991234')).toBe(true);
  });

  test('Brazilian 9-digit match with country code and area code', () => {
    // Brazilian: 55 + DDD (2 digits) + 9-digit (8 digits after country+area)
    expect(phoneMatches('5511934567890', '11934567890')).toBe(true);
  });

  // No match
  test('different numbers do not match', () => {
    expect(phoneMatches('11999991234', '21999991234')).toBe(false);
  });

  test('very different numbers do not match', () => {
    expect(phoneMatches('11999991234', '999999999')).toBe(false);
  });

  test('empty contact phone returns false', () => {
    expect(phoneMatches('', '11999991234')).toBe(false);
    expect(phoneMatches(null, '11999991234')).toBe(false);
  });

  test('empty search phone returns false', () => {
    expect(phoneMatches('11999991234', '')).toBe(false);
    expect(phoneMatches('11999991234', null)).toBe(false);
  });

  test('both empty returns false', () => {
    expect(phoneMatches('', '')).toBe(false);
  });

  // Brazilian-specific formats
  test('Brazilian DDD 11 with 9-digit format', () => {
    expect(phoneMatches('+55 11 98861-4543', '11988614543')).toBe(true);
  });

  test('Brazilian DDD 19 with 9-digit format', () => {
    expect(phoneMatches('+55 19 98861-4543', '19988614543')).toBe(true);
  });

  test('Brazilian with leading 0 local format', () => {
    expect(phoneMatches('0119988614543', '119988614543')).toBe(true);
  });

  // Guatemala format
  test('Guatemala number match', () => {
    expect(phoneMatches('+502 4512 3489', '50245123489')).toBe(true);
    expect(phoneMatches('50245123489', '45123489')).toBe(true);
  });

  // Edge cases
  test('8-digit numbers match exactly', () => {
    expect(phoneMatches('12345678', '12345678')).toBe(true);
    expect(phoneMatches('12345678', '87654321')).toBe(false);
  });

  test('short numbers match exactly', () => {
    expect(phoneMatches('1199', '1199')).toBe(true);
  });
});
=======
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
>>>>>>> origin/master
