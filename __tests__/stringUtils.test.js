const { escHtml } = require('../utils/stringUtils');

describe('escHtml', () => {
<<<<<<< HEAD
  test('escapes ampersand', () => {
    expect(escHtml('A & B')).toBe('A &amp; B');
  });

  test('escapes less-than', () => {
    expect(escHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes greater-than', () => {
    expect(escHtml('a > b')).toBe('a &gt; b');
  });

  test('escapes double quote', () => {
    expect(escHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  test('escapes single quote', () => {
    expect(escHtml("it's great")).toBe('it&#39;s great');
  });

  test('handles null input', () => {
    expect(escHtml(null)).toBe('');
  });

  test('handles undefined input', () => {
    expect(escHtml(undefined)).toBe('');
  });

  test('escapes multiple special characters', () => {
    expect(escHtml('<script>alert("XSS")</script>')).toBe(
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
    );
  });

  test('escapes name with apostrophe from Q10 catalog', () => {
    expect(escHtml("D'Angelo")).toBe('D&#39;Angelo');
  });

  test('returns string unchanged when no special chars', () => {
    expect(escHtml('Maria Silva')).toBe('Maria Silva');
  });
=======
  test('escapes &', () => expect(escHtml('A & B')).toBe('A &amp; B'));
  test('escapes <', () => expect(escHtml('<script>')).toBe('&lt;script&gt;'));
  test('escapes >', () => expect(escHtml('<script>')).toContain('&gt;'));
  test('escapes "', () => expect(escHtml('foo "bar"')).toContain('&quot;'));
  test('handles null', () => expect(escHtml(null)).toBe(''));
  test('handles undefined', () => expect(escHtml(undefined)).toBe(''));
  test('passthrough safe strings', () => expect(escHtml('hello world')).toBe('hello world'));
  test('handles numbers', () => expect(escHtml(123)).toBe('123'));
>>>>>>> origin/master
});
