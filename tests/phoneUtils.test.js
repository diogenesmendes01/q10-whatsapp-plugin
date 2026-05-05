const { normalizePhone, phoneMatches } = require('../utils/phoneUtils');

describe('normalizePhone', () => {
  test('strips all non-digit characters', () => {
    expect(normalizePhone('+55 (11) 99999-1234')).toBe('5511999991234');
    expect(normalizePhone('(11) 9999-1234')).toBe('1199991234');
    expect(normalizePhone('1199991234')).toBe('1199991234');
  });

  test('handles empty input', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  test('removes leading 0 from local Brazilian format', () => {
    expect(normalizePhone('011999991234')).toBe('11999991234');
    expect(normalizePhone('0999991234')).toBe('999991234');
  });

  test('keeps 55 country code for Brazilian numbers', () => {
    expect(normalizePhone('+5511999991234')).toBe('5511999991234');
    expect(normalizePhone('551199991234')).toBe('551199991234');
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
});

describe('phoneMatches', () => {
  test('exact match — same number', () => {
    expect(phoneMatches('11999991234', '11999991234')).toBe(true);
  });

  test('exact match with different formatting', () => {
    expect(phoneMatches('+55 11 99999-1234', '(11) 99999-1234')).toBe(true);
  });

  test('exact match — same with country code', () => {
    expect(phoneMatches('5511999991234', '+5511999991234')).toBe(true);
  });

  test('contact has country code, search does not', () => {
    expect(phoneMatches('5511999991234', '11999991234')).toBe(true);
  });

  test('search has country code, contact does not', () => {
    expect(phoneMatches('11999991234', '5511999991234')).toBe(true);
  });

  test('Brazilian 9-digit match with country code and area code', () => {
    expect(phoneMatches('5511934567890', '11934567890')).toBe(true);
  });

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

  test('Brazilian DDD 11 with 9-digit format', () => {
    expect(phoneMatches('+55 11 98861-4543', '11988614543')).toBe(true);
  });

  test('Brazilian DDD 19 with 9-digit format', () => {
    expect(phoneMatches('+55 19 98861-4543', '19988614543')).toBe(true);
  });

  test('Brazilian with leading 0 local format', () => {
    expect(phoneMatches('0119988614543', '119988614543')).toBe(true);
  });

  test('Guatemala number match', () => {
    expect(phoneMatches('+502 4512 3489', '50245123489')).toBe(true);
    expect(phoneMatches('50245123489', '45123489')).toBe(true);
  });

  test('8-digit numbers match exactly', () => {
    expect(phoneMatches('12345678', '12345678')).toBe(true);
    expect(phoneMatches('12345678', '87654321')).toBe(false);
  });

  test('short numbers match exactly', () => {
    expect(phoneMatches('1199', '1199')).toBe(true);
  });
});
