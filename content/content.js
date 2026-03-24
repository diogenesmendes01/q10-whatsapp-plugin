/* ============================================================
   Q10 CRM — Content Script (WhatsApp Web)
   Detects phone number OR contact name from conversation.
   Panel UI lives in Chrome Side Panel.
   v2.2 — Name + Phone detection
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
    console.log('[Q10 CRM] Toggle button created');
  }

  // ================================================================
  //  DETECTION HELPERS
  // ================================================================
  function isPhoneNumber(text) {
    const cleaned = (text || '').replace(/[\s\-\(\)\u200e\u200f\u202a\u202c]/g, '');
    return /^\+?\d{10,15}$/.test(cleaned) ? cleaned : null;
  }

  function isContactName(text) {
    const trimmed = (text || '').trim();
    // Skip empty, very short, status messages, dates, etc.
    if (!trimmed || trimmed.length < 2 || trimmed.length > 60) return null;
    // Skip if it's a phone number
    if (isPhoneNumber(trimmed)) return null;
    // Skip common WhatsApp UI text
    const skipList = ['click here', 'type a message', 'search', 'chats', 'status', 'communities',
      'new chat', 'disappearing messages', 'default', 'haz clic', 'escribe', 'buscar',
      'en línea', 'online', 'typing', 'escribiendo', 'last seen', 'últ. vez',
      'today', 'yesterday', 'hoy', 'ayer', 'encrypted', 'cifrado'];
    if (skipList.some(s => trimmed.toLowerCase().includes(s))) return null;
    // Must have at least one letter
    if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑüÜ]/.test(trimmed)) return null;
    return trimmed;
  }

  // ================================================================
  //  EXTRACT CONTACT INFO FROM DOM
  // ================================================================
  function extractContactFromDOM() {
    // --- Try to get phone first ---
    
    // Strategy 1: Header title (unsaved contacts)
    const headerEl = document.querySelector('#main header span[title]');
    if (headerEl) {
      const title = headerEl.getAttribute('title') || '';
      const phone = isPhoneNumber(title);
      if (phone) return { type: 'phone', value: phone };
    }

    // Strategy 2: data-id from messages (has phone in format: number@c.us)
    const msgContainers = document.querySelectorAll('#main [data-id]');
    for (const el of msgContainers) {
      const dataId = el.getAttribute('data-id') || '';
      const match = dataId.match(/(\d{10,15})@/);
      if (match) return { type: 'phone', value: match[1] };
    }

    // Strategy 3: All spans in header for phone-like text
    const mainHeader = document.querySelector('#main header');
    if (mainHeader) {
      const spans = mainHeader.querySelectorAll('span');
      for (const span of spans) {
        const phone = isPhoneNumber(span.textContent) || isPhoneNumber(span.getAttribute('title'));
        if (phone) return { type: 'phone', value: phone };
      }
    }

    // --- If no phone found, get the contact name ---
    
    // Strategy 4: Header title is a saved contact name
    if (headerEl) {
      const title = headerEl.getAttribute('title') || '';
      const name = isContactName(title);
      if (name) return { type: 'name', value: name };
    }

    // Strategy 5: First span with dir="auto" in header (contact name)
    if (mainHeader) {
      const autoSpan = mainHeader.querySelector('span[dir="auto"]');
      if (autoSpan) {
        const name = isContactName(autoSpan.textContent);
        if (name) return { type: 'name', value: name };
      }
    }

    return null;
  }

  // ================================================================
  //  OBSERVE CONVERSATION CHANGES
  // ================================================================
  let observerDebounce = null;
  let lastDetected = null; // { type, value }

  function onConversationChange() {
    clearTimeout(observerDebounce);
    observerDebounce = setTimeout(() => {
      const contact = extractContactFromDOM();
      const key = contact ? `${contact.type}:${contact.value}` : null;
      const lastKey = lastDetected ? `${lastDetected.type}:${lastDetected.value}` : null;

      if (key && key !== lastKey) {
        lastDetected = contact;
        console.log(`[Q10 CRM] Detected ${contact.type}: ${contact.value}`);
        // Notify service worker
        if (contact.type === 'phone') {
          chrome.runtime.sendMessage({ action: 'phoneChanged', phone: contact.value, contactName: null });
        } else {
          chrome.runtime.sendMessage({ action: 'phoneChanged', phone: null, contactName: contact.value });
        }
        const btn = document.getElementById('q10-toggle-btn');
        if (btn) btn.classList.add('q10-has-data');
      } else if (!contact && lastDetected) {
        lastDetected = null;
        chrome.runtime.sendMessage({ action: 'phoneChanged', phone: null, contactName: null });
        const btn = document.getElementById('q10-toggle-btn');
        if (btn) btn.classList.remove('q10-has-data');
      }
    }, 500);
  }

  // ================================================================
  //  INIT
  // ================================================================
  function init() {
    console.log('[Q10 CRM] Initializing content script v2.2...');
    createToggleButton();

    const observer = new MutationObserver(() => onConversationChange());
    const watchTarget = document.getElementById('app') || document.body;
    observer.observe(watchTarget, { childList: true, subtree: true });

    document.addEventListener('click', () => setTimeout(onConversationChange, 300), true);
    setTimeout(onConversationChange, 1000);

    console.log('[Q10 CRM] Content script ready (v2.2 — Name + Phone detection)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
