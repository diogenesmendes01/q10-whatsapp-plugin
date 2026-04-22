const { escHtml } = require('../utils/stringUtils');

describe('escHtml', () => {
  test('escapes &', () => expect(escHtml('A & B')).toBe('A &amp; B'));
  test('escapes <', () => expect(escHtml('<script>')).toBe('&lt;script&gt;'));
  test('escapes >', () => expect(escHtml('<script>')).toContain('&gt;'));
  test('escapes "', () => expect(escHtml('foo "bar"')).toContain('&quot;'));
  test('handles null', () => expect(escHtml(null)).toBe(''));
  test('handles undefined', () => expect(escHtml(undefined)).toBe(''));
  test('passthrough safe strings', () => expect(escHtml('hello world')).toBe('hello world'));
  test('handles numbers', () => expect(escHtml(123)).toBe('123'));
});
