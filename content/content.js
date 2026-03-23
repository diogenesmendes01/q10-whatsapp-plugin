/* ============================================================
   Q10 CRM — Content Script (WhatsApp Web)
   Lightweight: only detects phone + toggle button.
   Panel UI lives in Chrome Side Panel.
   ============================================================ */

(function () {
  'use strict';

  const LOGO_SVG = `<svg viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="white" fill-opacity="0.2"/><text x="14" y="20" text-anchor="middle" font-size="16" font-weight="bold" fill="white" font-family="Inter,sans-serif">Q</text></svg>`;

  // ================================================================
  //  TOGGLE BUTTON
  // ================================================================
  function createToggleButton() {
    if (document.getElementById('q10-toggle-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'q10-toggle-btn';
    btn.id = 'q10-toggle-btn';
    btn.title = 'Q10 CRM';
    btn.innerHTML = `<span class="q10-toggle-icon">${LOGO_SVG}</span>`;
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openSidePanel' });
    });
    document.body.appendChild(btn);
  }

  // ================================================================
  //  PHONE DETECTION FROM WHATSAPP WEB DOM
  // ================================================================
  function extractPhoneFromDOM() {
    const headerSelectors = [
      'header span[title]',
      'header ._amig span',
      'header [data-testid="conversation-info-header"] span',
      '#main header span[title]',
      '#main header span[dir="auto"]',
    ];
    for (const sel of headerSelectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const text = (el.getAttribute('title') || el.textContent || '').trim();
        const cleaned = text.replace(/[\s\-\(\)]/g, '');
        if (/^\+?\d{10,15}$/.test(cleaned)) return cleaned;
      }
    }

    const contactInfoSelectors = ['[data-testid="contact-info-drawer"] span[title]', 'section span[title]'];
    for (const sel of contactInfoSelectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const text = (el.getAttribute('title') || el.textContent || '').trim();
        const cleaned = text.replace(/[\s\-\(\)]/g, '');
        if (/^\+?\d{10,15}$/.test(cleaned)) return cleaned;
      }
    }

    const chatEl = document.querySelector('#main [data-id]');
    if (chatEl) {
      const dataId = chatEl.getAttribute('data-id') || '';
      const match = dataId.match(/(\d{10,15})@/);
      if (match) return match[1];
    }

    return null;
  }

  // ================================================================
  //  OBSERVE CONVERSATION CHANGES
  // ================================================================
  let observerDebounce = null;
  let lastDetectedPhone = null;

  function onConversationChange() {
    clearTimeout(observerDebounce);
    observerDebounce = setTimeout(() => {
      const phone = extractPhoneFromDOM();
      if (phone && phone !== lastDetectedPhone) {
        lastDetectedPhone = phone;
        // Notify service worker of phone change
        chrome.runtime.sendMessage({ action: 'phoneChanged', phone });
        // Update toggle button state
        const btn = document.getElementById('q10-toggle-btn');
        if (btn) btn.classList.add('q10-has-data');
      } else if (!phone && lastDetectedPhone) {
        lastDetectedPhone = null;
        chrome.runtime.sendMessage({ action: 'phoneChanged', phone: null });
        const btn = document.getElementById('q10-toggle-btn');
        if (btn) btn.classList.remove('q10-has-data');
      }
    }, 500);
  }

  // ================================================================
  //  INIT
  // ================================================================
  function init() {
    createToggleButton();

    const observer = new MutationObserver(() => onConversationChange());
    const watchTarget = document.getElementById('app') || document.body;
    observer.observe(watchTarget, { childList: true, subtree: true });

    document.addEventListener('click', () => setTimeout(onConversationChange, 300), true);

    console.log('[Q10 CRM] Content script loaded (v2.0 — Side Panel mode)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
