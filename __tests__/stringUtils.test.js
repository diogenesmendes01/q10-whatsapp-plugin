<<<<<<< HEAD
const { escHtml, normalizeString, containsAllWords } = require('../utils/stringUtils');

describe('escHtml', () => {
  test('escapes ampersand', () => {
    expect(escHtml('a & b')).toBe('a &amp; b');
=======
const { escHtml } = require('../utils/stringUtils');

describe('escHtml', () => {
<<<<<<< HEAD
  test('escapes ampersand', () => {
    expect(escHtml('A & B')).toBe('A &amp; B');
>>>>>>> origin/master
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
<<<<<<< HEAD
    expect(escHtml("it's fine")).toBe('it&#39;s fine');
  });

  test('escapes all special characters together', () => {
    expect(escHtml('<div class="test" onerror="alert(1)">')).toBe(
      '&lt;div class=&quot;test&quot; onerror=&quot;alert(1)&quot;&gt;'
    );
=======
    expect(escHtml("it's great")).toBe('it&#39;s great');
>>>>>>> origin/master
  });

  test('handles null input', () => {
    expect(escHtml(null)).toBe('');
  });

  test('handles undefined input', () => {
    expect(escHtml(undefined)).toBe('');
  });

<<<<<<< HEAD
  test('handles empty string', () => {
    expect(escHtml('')).toBe('');
  });

  test('handles number input', () => {
    expect(escHtml(123)).toBe('123');
    expect(escHtml(0)).toBe('0');
  });

  test('passes through normal text unchanged', () => {
    expect(escHtml('Hello World')).toBe('Hello World');
    expect(escHtml('João Silva')).toBe('João Silva');
  });

  test('preserves unicode characters without encoding them', () => {
    expect(escHtml('José')).toBe('José');
    expect(escHtml('Ñoño')).toBe('Ñoño');
  });

  test('XSS prevention — script tag escaped', () => {
    expect(escHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });
});

describe('normalizeString', () => {
  test('lowercases text', () => {
    expect(normalizeString('HELLO')).toBe('hello');
    expect(normalizeString('HeLLo')).toBe('hello');
  });

  test('removes diacritics/accents', () => {
    expect(normalizeString('João')).toBe('joao');
    expect(normalizeString('José')).toBe('jose');
    expect(normalizeString('Ñoño')).toBe('nono');
  });

  test('handles combined cases', () => {
    expect(normalizeString('JOÃO SILVA')).toBe('joao silva');
  });

  test('handles null input', () => {
    expect(normalizeString(null)).toBe('');
  });

  test('handles undefined input', () => {
    expect(normalizeString(undefined)).toBe('');
  });

  test('handles empty string', () => {
    expect(normalizeString('')).toBe('');
  });
});

describe('containsAllWords', () => {
  test('matches single word', () => {
    expect(containsAllWords('João Silva', 'joao')).toBe(true);
    expect(containsAllWords('Maria Santos', 'maria')).toBe(true);
  });

  test('matches all words in phrase', () => {
    expect(containsAllWords('João Silva', 'joao silva')).toBe(true);
    expect(containsAllWords('Maria da Silva', 'maria silva')).toBe(true);
  });

  test('partial match — word appears in text', () => {
    expect(containsAllWords('João Silva Santos', 'joao')).toBe(true);
  });

  test('no match — different word', () => {
    expect(containsAllWords('João Silva', 'pedro')).toBe(false);
  });

  test('requires all words to be present', () => {
    expect(containsAllWords('João Silva', 'joao pedro')).toBe(false);
  });

  test('ignores short words (< 2 chars)', () => {
    expect(containsAllWords('João Silva', 'a')).toBe(true);
    // 'de' is 2 chars — also should be ignored
    expect(containsAllWords('João Silva', 'de')).toBe(true);
  });

  test('handles null haystack', () => {
    expect(containsAllWords(null, 'hello')).toBe(false);
  });

  test('handles null needle', () => {
    expect(containsAllWords('hello', null)).toBe(false);
  });

  test('handles empty strings', () => {
    expect(containsAllWords('', '')).toBe(true);
    expect(containsAllWords('hello', '')).toBe(true);
  });

  test('handles case differences', () => {
    expect(containsAllWords('João Silva', 'JOAO')).toBe(true);
    expect(containsAllWords('Maria', 'maria')).toBe(true);
  });

  test('handles accents properly', () => {
    expect(containsAllWords('José da Silva', 'jose')).toBe(true);
    expect(containsAllWords('João', 'joao')).toBe(true);
  });
});
=======
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
>>>>>>> origin/master
