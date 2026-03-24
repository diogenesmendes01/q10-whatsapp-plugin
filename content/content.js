/* ============================================================
   Q10 CRM — Content Script (WhatsApp Web)
   Bridge between inject.js (page context) and extension (isolated world).
   Primary: inject.js via Store API → postMessage → content.js → service worker
   Fallback: DOM-based extraction if inject fails or Store unavailable.
   v3.0 — Inject bridge + DOM fallback
   ============================================================ */

(function () {
  'use strict';

  const VERSION = '3.0';
  const LOG_PREFIX = '[Q10 CRM]';
  const POLL_INTERVAL_MS = 2000;
  const INJECT_TIMEOUT_MS = 5000;

  const LOGO_SVG = `<svg viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="white" fill-opacity="0.2"/><text x="14" y="20" text-anchor="middle" font-size="16" font-weight="bold" fill="white" font-family="Inter,sans-serif">Q</text></svg>`;

  let lastDetectedKey = null;
  let injectLoaded = false;
  let receivedInjectData = false;
  let injected = false;
  let domFallbackActive = false;
  let domObserver = null;

  // ================================================================
  //  LOGGING
  // ================================================================
  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function error(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  // ================================================================
  //  INJECT SCRIPT INTO PAGE CONTEXT
  // ================================================================
  function injectScript() {
    if (injected) {
      log('Inject script already loaded, skipping.');
      return;
    }

    try {
      const script = document.createElement('script');
      // Load loader.js first (finds WhatsApp Store)
      const loader = document.createElement('script');
      loader.src = chrome.runtime.getURL('inject/loader.js');
      loader.type = 'text/javascript';
      loader.onload = () => {
        console.log(TAG, 'loader.js injected');
        loader.remove();
      };
      (document.head || document.documentElement).appendChild(loader);
      
      // Then load inject.js (uses Store for chat detection)
      script.src = chrome.runtime.getURL('inject/inject.js');
      script.type = 'text/javascript';

      script.onload = () => {
        injected = true;
        injectLoaded = true;
        log('inject.js loaded successfully into page context.');
        script.remove(); // Clean up DOM
      };

      script.onerror = (e) => {
        injected = false;
        injectLoaded = false;
        warn('Failed to load inject.js, DOM fallback will activate.', e);
        script.remove();
      };

      (document.head || document.documentElement).appendChild(script);
      log('Injecting inject.js into page...');
    } catch (e) {
      error('Error injecting script:', e);
    }
  }

  // ================================================================
  //  NOTIFY SERVICE WORKER (deduplicated)
  // ================================================================
  function notifyServiceWorker({ phone, name, isGroup }) {
    const key = `${phone || ''}:${name || ''}:${isGroup || false}`;

    if (key === lastDetectedKey) return; // No change, skip
    lastDetectedKey = key;

    const message = {
      action: 'phoneChanged',
      phone: phone || null,
      contactName: name || null,
      isGroup: isGroup || false
    };

    log(`Sending to service worker:`, message);

    try {
      chrome.runtime.sendMessage(message);
    } catch (e) {
      error('Failed to send message to service worker:', e);
    }

    // Update button indicator
    const btn = document.getElementById('q10-toggle-btn');
    if (btn) {
      if (phone || name) {
        btn.classList.add('q10-has-data');
      } else {
        btn.classList.remove('q10-has-data');
      }
    }
  }

  // ================================================================
  //  LISTEN FOR MESSAGES FROM inject.js (primary detection)
  // ================================================================
  function setupInjectListener() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (!event.data?.type) return;

      if (event.data.type === 'Q10_CHAT_DATA') {
        receivedInjectData = true;
        const { phone, name, isGroup, chatId } = event.data.data || {};
        log(`Received chat data from inject: phone=${phone}, name=${name}, isGroup=${isGroup}, chatId=${chatId}`);
        notifyServiceWorker({ phone, name, isGroup });
      }

      if (event.data.type === 'Q10_INJECT_READY') {
        log('inject.js reports ready (Store available).');
        receivedInjectData = true;
      }
    });

    log('Listening for postMessage from inject.js.');
  }

  // ================================================================
  //  POLL inject.js FOR CURRENT CHAT (periodic + click)
  // ================================================================
  function setupPolling() {
    // Poll every 2 seconds
    setInterval(() => {
      window.postMessage({ type: 'Q10_GET_CURRENT_CHAT' }, '*');
    }, POLL_INTERVAL_MS);

    // Also request on click (conversation switch)
    document.addEventListener('click', () => {
      setTimeout(() => {
        window.postMessage({ type: 'Q10_GET_CURRENT_CHAT' }, '*');
      }, 500);
    }, true);

    log('Polling setup complete (interval + click listener).');
  }

  // ================================================================
  //  DOM-BASED FALLBACK DETECTION
  // ================================================================
  function isPhoneNumber(text) {
    const cleaned = (text || '').replace(/[\s\-\(\)\u200e\u200f\u202a\u202c]/g, '');
    return /^\+?\d{10,15}$/.test(cleaned) ? cleaned : null;
  }

  function isContactName(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 60) return null;
    if (isPhoneNumber(trimmed)) return null;
    const skipList = [
      'click here', 'type a message', 'search', 'chats', 'status', 'communities',
      'new chat', 'disappearing messages', 'default', 'haz clic', 'escribe', 'buscar',
      'en línea', 'online', 'typing', 'escribiendo', 'last seen', 'últ. vez',
      'today', 'yesterday', 'hoy', 'ayer', 'encrypted', 'cifrado',
      'digite uma mensagem', 'pesquisar', 'conversas', 'digitando', 'visto por último'
    ];
    if (skipList.some(s => trimmed.toLowerCase().includes(s))) return null;
    if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑüÜàèìòùãõâêîôûçÇ]/.test(trimmed)) return null;
    return trimmed;
  }

  function extractContactFromDOM() {
    // --- Try phone first ---
    const headerEl = document.querySelector('#main header span[title]');
    if (headerEl) {
      const title = headerEl.getAttribute('title') || '';
      const phone = isPhoneNumber(title);
      if (phone) return { phone, name: null, isGroup: false };
    }

    // data-id from messages (number@c.us)
    const msgContainers = document.querySelectorAll('#main [data-id]');
    for (const el of msgContainers) {
      const dataId = el.getAttribute('data-id') || '';
      const match = dataId.match(/(\d{10,15})@/);
      if (match) return { phone: match[1], name: null, isGroup: false };
    }

    // All spans in header for phone-like text
    const mainHeader = document.querySelector('#main header');
    if (mainHeader) {
      const spans = mainHeader.querySelectorAll('span');
      for (const span of spans) {
        const phone = isPhoneNumber(span.textContent) || isPhoneNumber(span.getAttribute('title'));
        if (phone) return { phone, name: null, isGroup: false };
      }
    }

    // --- If no phone, try contact name ---
    if (headerEl) {
      const title = headerEl.getAttribute('title') || '';
      const name = isContactName(title);
      if (name) {
        // Check if it's a group by looking for group indicators
        const isGroup = !!mainHeader?.querySelector('span[data-icon="default-group"]') ||
                        !!document.querySelector('#main header img[data-icon="default-group"]');
        return { phone: null, name, isGroup };
      }
    }

    if (mainHeader) {
      const autoSpan = mainHeader.querySelector('span[dir="auto"]');
      if (autoSpan) {
        const name = isContactName(autoSpan.textContent);
        if (name) return { phone: null, name, isGroup: false };
      }
    }

    return null;
  }

  let domDebounce = null;

  function onDOMConversationChange() {
    if (!domFallbackActive) return;

    clearTimeout(domDebounce);
    domDebounce = setTimeout(() => {
      const contact = extractContactFromDOM();
      if (contact) {
        log('[DOM Fallback] Detected:', contact);
        notifyServiceWorker(contact);
      } else {
        notifyServiceWorker({ phone: null, name: null, isGroup: false });
      }
    }, 500);
  }

  function activateDOMFallback() {
    if (domFallbackActive) return;
    domFallbackActive = true;
    warn('Activating DOM-based fallback detection (inject not responding).');

    domObserver = new MutationObserver(() => onDOMConversationChange());
    const watchTarget = document.getElementById('app') || document.body;
    domObserver.observe(watchTarget, { childList: true, subtree: true });

    document.addEventListener('click', () => setTimeout(onDOMConversationChange, 300), true);

    // Run immediately
    onDOMConversationChange();
  }

  function deactivateDOMFallback() {
    if (!domFallbackActive) return;
    domFallbackActive = false;
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    log('DOM fallback deactivated (inject.js is providing data).');
  }

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
      try {
        chrome.runtime.sendMessage({ action: 'openSidePanel' });
      } catch (e) {
        error('Failed to open side panel:', e);
      }
    });

    document.body.appendChild(btn);
    log('Toggle button created.');
  }

  // ================================================================
  //  INIT
  // ================================================================
  function init() {
    log(`Initializing content script v${VERSION}...`);

    // 1. Create UI
    createToggleButton();

    // 2. Setup listener for inject.js messages (before injecting)
    setupInjectListener();

    // 3. Inject the script into page context
    injectScript();

    // 4. Setup polling to request chat data from inject
    setupPolling();

    // 5. Schedule DOM fallback activation if inject doesn't respond
    setTimeout(() => {
      if (!receivedInjectData) {
        warn(`No data from inject.js after ${INJECT_TIMEOUT_MS}ms.`);
        activateDOMFallback();
      } else {
        log('inject.js is responding, DOM fallback not needed.');
      }
    }, INJECT_TIMEOUT_MS);

    // 6. If inject starts responding later, deactivate DOM fallback
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type === 'Q10_CHAT_DATA' && domFallbackActive) {
        log('inject.js started responding, switching from DOM fallback to inject.');
        deactivateDOMFallback();
      }
    });

    log(`Content script ready (v${VERSION} — Inject bridge + DOM fallback).`);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
