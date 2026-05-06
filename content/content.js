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
        console.log(LOG_PREFIX, 'loader.js injected');
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
    const mainHeader = document.querySelector('#main header');
    const headerEl = document.querySelector('#main header span');
    let detectedPhone = null;
    let detectedName = null;
    let isGroup = false;

    // 1. Get name from header (always try)
    if (headerEl) {
      const headerText = (headerEl.textContent || '').trim();
      const phoneFromHeader = isPhoneNumber(headerText);
      if (phoneFromHeader) {
        detectedPhone = phoneFromHeader;
      } else {
        const nameFromHeader = isContactName(headerText);
        if (nameFromHeader) detectedName = nameFromHeader;
      }
    }

    // 2. Get phone from data-id in messages (number@c.us format)
    if (!detectedPhone) {
      const msgContainers = document.querySelectorAll('#main [data-id]');
      for (const el of msgContainers) {
        const dataId = el.getAttribute('data-id') || '';
        // Format: "true_5519988145438@c.us_XXXXX" or "false_5519988145438@c.us_XXXXX"
        const match = dataId.match(/(\d{10,15})@/);
        if (match) { detectedPhone = match[1]; break; }
      }
    }

    // 3. Check all spans in header for phone
    if (!detectedPhone && mainHeader) {
      const spans = mainHeader.querySelectorAll('span');
      for (const span of spans) {
        const phone = isPhoneNumber(span.textContent);
        if (phone) { detectedPhone = phone; break; }
      }
    }

    // 4. Try span[dir="auto"] for name if still missing
    if (!detectedName && mainHeader) {
      const autoSpan = mainHeader.querySelector('span[dir="auto"]');
      if (autoSpan) {
        const name = isContactName(autoSpan.textContent);
        if (name) detectedName = name;
      }
    }

    // 5. Check if group
    if (mainHeader) {
      isGroup = !!mainHeader.querySelector('span[data-icon="default-group"]') ||
                !!document.querySelector('#main header img[data-icon="default-group"]');
    }

    if (!detectedPhone && !detectedName) return null;

    log('[DOM] Extracted — name:', detectedName, 'phone:', detectedPhone, 'group:', isGroup);
    return { phone: detectedPhone, name: detectedName, isGroup };
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
  //  INIT
  // ================================================================
  function init() {
    log(`Initializing content script v${VERSION}...`);

    // 2. Setup listener for inject.js messages (before injecting)
    setupInjectListener();

    // 3. Inject the script into page context
    injectScript();

    // 4. Setup polling to request chat data from inject
    setupPolling();

    // 5. Activate DOM fallback immediately (runs in parallel with inject)
    // If inject starts responding, DOM fallback will be deactivated
    activateDOMFallback();

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


  // ================================================================
  //  CONVERSATION EXPORT (messages from current chat)
  // ================================================================
  function extractConversationMessages() {
    const messages = [];
    const msgElements = document.querySelectorAll('[data-testid="msg-container"], .message-in, .message-out');

    msgElements.forEach(el => {
      const isOutgoing = el.classList.contains('message-out') || !!el.closest('.message-out');
      const textEl = el.querySelector('.selectable-text');
      const text = textEl?.innerText || '';
      const timeEl = el.querySelector('[data-testid="msg-meta"] span, .msg-time');
      const time = timeEl?.textContent || '';
      const prePlain = el.querySelector('[data-pre-plain-text]');
      const meta = prePlain?.getAttribute('data-pre-plain-text') || '';

      if (text.trim()) {
        messages.push({
          direction: isOutgoing ? 'sent' : 'received',
          text: text.trim(),
          time: time.trim(),
          meta: meta.trim()
        });
      }
    });

    return messages;
  }

  // ================================================================
  //  BATCH CONTACTS EXTRACTION (scroll chat list)
  // ================================================================
  let batchExtracting = false;
  // Bumped on every start. The running loop captures its own value and exits
  // silently if it gets superseded — prevents a stop→start race where the old
  // loop, still asleep in setTimeout, would resume and run alongside the new one.
  let batchGen = 0;

  function findChatListPane() {
    // WhatsApp Web rotates DOM structure across versions; try the stable
    // selectors in order of preference. Fallback to a heuristic scan that
    // looks for the largest scrollable element on the left half of the page.
    return document.querySelector('#pane-side')
        || document.querySelector('[aria-label="Chat list"]')
        || document.querySelector('[aria-label="Lista de conversas"]')
        || document.querySelector('[aria-label="Lista de chats"]')
        || document.querySelector('div[role="grid"]')
        || null;
  }

  function extractVisibleChatContacts() {
    const contacts = new Map();
    const pane = findChatListPane();
    if (!pane) return contacts;

    // Modern WA Web (2024+) uses [role="listitem"] for chat rows; older
    // versions exposed [data-id="PHONE@c.us"] directly. Try both, plus a
    // catch-all that walks every descendant looking for an @c.us attribute.
    const itemSets = [
      pane.querySelectorAll('[data-id]'),
      pane.querySelectorAll('[role="listitem"]'),
      pane.querySelectorAll('[role="row"]'),
    ];

    const seenItems = new Set();
    for (const items of itemSets) {
      items.forEach(item => {
        if (seenItems.has(item)) return;
        seenItems.add(item);

        // Phone discovery: check the item itself and every descendant for
        // any attribute containing "PHONE@c.us" — handles the case where
        // WA moved the data-id one level down.
        let phone = null;
        const own = item.getAttribute?.('data-id') || '';
        let m = own.match(/(\d{10,15})@c\.us/);
        if (m) {
          phone = m[1];
        } else {
          const dataIdChild = item.querySelector('[data-id*="@c.us"]');
          if (dataIdChild) {
            m = (dataIdChild.getAttribute('data-id') || '').match(/(\d{10,15})@c\.us/);
            if (m) phone = m[1];
          }
        }
        // Skip groups (@g.us) and rows that don't carry a phone.
        if (!phone) return;

        // Name: try several selectors, preferring the cell-frame-title
        // structure but falling back to any visible span with a title or
        // dir attribute.
        const nameEl =
          item.querySelector('[data-testid="cell-frame-title"] span') ||
          item.querySelector('[title]:not([title=""])') ||
          item.querySelector('span[dir="auto"]') ||
          item.querySelector('span[title]');
        const rawName = (nameEl?.getAttribute('title') || nameEl?.textContent || '').trim();
        const name = /^[\d\s\+\-\(\)]+$/.test(rawName) ? '' : rawName;

        if (!contacts.has(phone)) contacts.set(phone, { phone, name });
      });
    }
    return contacts;
  }

  async function runBatchExtraction(cutoffMs) {
    const myGen = ++batchGen;
    batchExtracting = true;
    const allContacts = new Map();
    const pane = findChatListPane();

    log('[batch] starting extraction. pane found:', !!pane, 'cutoffMs:', cutoffMs);

    if (!pane) {
      chrome.runtime.sendMessage({ action: 'batchExtractComplete', ok: false, error: 'Painel de conversas não encontrado. Abra a aba do WhatsApp Web e certifique-se de que a lista de conversas está visível.' });
      return;
    }

    let noNewCount = 0;
    let lastCount = 0;

    while (batchExtracting && myGen === batchGen) {
      const batch = extractVisibleChatContacts();
      batch.forEach((v, k) => allContacts.set(k, v));

      const newCount = allContacts.size;
      chrome.runtime.sendMessage({ action: 'batchExtractProgress', count: newCount });

      // Stop if cutoff date reached — check last visible chat item timestamp
      if (cutoffMs) {
        const timeEls = pane.querySelectorAll('[data-testid="cell-frame-secondary-detail"] span');
        const lastTimeEl = timeEls[timeEls.length - 1];
        if (lastTimeEl) {
          const txt = (lastTimeEl.textContent || '').trim();
          // WhatsApp shows absolute dates like "12/05/24" for old chats
          const dateMatch = txt.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
          if (dateMatch) {
            const [, d, m, y] = dateMatch;
            const fullYear = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
            const chatDate = new Date(fullYear, parseInt(m) - 1, parseInt(d)).getTime();
            if (chatDate < cutoffMs) {
              batchExtracting = false;
              break;
            }
          }
        }
      }

      if (newCount === lastCount) {
        noNewCount++;
        if (noNewCount >= 4) break; // 4 scrolls with no new = reached end
      } else {
        noNewCount = 0;
      }
      lastCount = newCount;

      pane.scrollTop += 700;
      await new Promise(r => setTimeout(r, 700));
    }

    // Superseded by a newer run — exit silently; the new run will send complete.
    if (myGen !== batchGen) return;

    batchExtracting = false;
    const result = Array.from(allContacts.values());
    log('[batch] extraction finished. contacts:', result.length);

    if (result.length === 0) {
      chrome.runtime.sendMessage({
        action: 'batchExtractComplete',
        ok: false,
        error: 'Nenhuma conversa individual encontrada. Verifique se há chats com contatos pessoais (não grupos) na lista do WhatsApp Web e que ela esteja visível no painel lateral.'
      });
      return;
    }
    chrome.runtime.sendMessage({ action: 'batchExtractComplete', ok: true, data: result });
  }

  // Listen for export request from sidepanel via service worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'exportConversation') {
      try {
        const messages = extractConversationMessages();
        sendResponse({ ok: true, data: messages });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
      return true;
    }

    if (msg.action === 'batchExtractStart') {
      if (batchExtracting) { sendResponse({ ok: true }); return true; }
      const cutoffMs = msg.cutoffMs || null;
      runBatchExtraction(cutoffMs);
      sendResponse({ ok: true });
      return true;
    }

    if (msg.action === 'batchExtractStop') {
      batchExtracting = false;
      sendResponse({ ok: true });
      return true;
    }
  });
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
