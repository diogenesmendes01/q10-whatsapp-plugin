/* ============================================================
   Q10 CRM — Content Script (WhatsApp Web)
   Lightweight: only detects phone + toggle button.
   Panel UI lives in Chrome Side Panel.
   v2.1 — Improved phone detection for saved contacts
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
  function isPhoneNumber(text) {
    const cleaned = (text || '').replace(/[\s\-\(\)\u200e\u200f\u202a\u202c]/g, '');
    return /^\+?\d{10,15}$/.test(cleaned) ? cleaned : null;
  }

  function extractPhoneFromDOM() {
    // Strategy 1: Header title (unsaved contacts show phone directly)
    const headerSelectors = [
      '#main header span[title]',
      '#main header span[dir="auto"]',
      'header span[title]',
      'header ._amig span',
      'header [data-testid="conversation-info-header"] span',
    ];
    for (const sel of headerSelectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const title = el.getAttribute('title') || '';
        const text = el.textContent || '';
        const phone = isPhoneNumber(title) || isPhoneNumber(text);
        if (phone) return phone;
      }
    }

    // Strategy 2: Look for phone in the conversation panel's data attributes
    // WhatsApp stores the chat ID in data-id attributes (format: number@c.us)
    const chatElements = document.querySelectorAll('#main [data-id], #main [data-testid] [data-id]');
    for (const el of chatElements) {
      const dataId = el.getAttribute('data-id') || '';
      const match = dataId.match(/(\d{10,15})@/);
      if (match) return match[1];
    }

    // Strategy 3: Message bubbles contain sender info with phone
    const msgSelectors = [
      '[data-testid="msg-container"] [data-pre-plain-text]',
      '.message-in [data-pre-plain-text]',
    ];
    for (const sel of msgSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const attr = el.getAttribute('data-pre-plain-text') || '';
        const match = attr.match(/(\+?\d[\d\s\-]{9,})/);
        if (match) {
          const phone = isPhoneNumber(match[1]);
          if (phone) return phone;
        }
      }
    }

    // Strategy 4: Contact info drawer (when user clicks contact name)
    const drawerSelectors = [
      '[data-testid="contact-info-drawer"] span[title]',
      '[data-testid="contact-info-drawer"] span[dir="auto"]',
      'section span[title]',
      '[data-testid="chat-info-drawer"] span',
    ];
    for (const sel of drawerSelectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const title = el.getAttribute('title') || '';
        const text = el.textContent || '';
        const phone = isPhoneNumber(title) || isPhoneNumber(text);
        if (phone) return phone;
      }
    }

    // Strategy 5: URL-based detection (WhatsApp Web URL sometimes has phone)
    const urlMatch = window.location.hash.match(/(\d{10,15})/);
    if (urlMatch) return urlMatch[1];

    // Strategy 6: Search all spans in the header area for phone-like text
    const mainHeader = document.querySelector('#main header');
    if (mainHeader) {
      const allSpans = mainHeader.querySelectorAll('span');
      for (const span of allSpans) {
        const phone = isPhoneNumber(span.textContent);
        if (phone) return phone;
        const title = span.getAttribute('title');
        if (title) {
          const p = isPhoneNumber(title);
          if (p) return p;
        }
      }
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
        console.log('[Q10 CRM] Phone detected:', phone);
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

    // Observe DOM changes for conversation switches
    const observer = new MutationObserver(() => onConversationChange());
    const watchTarget = document.getElementById('app') || document.body;
    observer.observe(watchTarget, { childList: true, subtree: true });

    // Also detect on click (conversation switch via click)
    document.addEventListener('click', () => setTimeout(onConversationChange, 300), true);

    // Initial check
    setTimeout(onConversationChange, 1000);

    console.log('[Q10 CRM] Content script loaded (v2.1 — Enhanced phone detection)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
