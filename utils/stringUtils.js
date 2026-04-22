/**
 * String utilities - extracted from options.js / sidepanel.js
 */

function escHtml(s) {
  if (s == null) return '';
  return (s + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { escHtml };
