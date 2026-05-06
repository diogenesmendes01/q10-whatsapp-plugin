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
      // Inject store-adapter.js DIRECTLY from the content script. WhatsApp's
      // CSP silently blocks chrome-extension:// URLs added to <script> tags
      // from inside the page context, so loader.js's attempt to inject the
      // adapter fails without firing onload OR onerror. Doing it from the
      // content script (privileged context) bypasses the block.
      const adapter = document.createElement('script');
      adapter.src = chrome.runtime.getURL('inject/store-adapter.js');
      adapter.type = 'text/javascript';
      adapter.onload = () => {
        log('store-adapter.js loaded into page context.');
        adapter.remove();
      };
      adapter.onerror = (e) => {
        warn('Failed to load store-adapter.js.', e);
        adapter.remove();
      };
      (document.head || document.documentElement).appendChild(adapter);

      // loader.js (kept for the adapter-readiness signaling logic only).
      const loader = document.createElement('script');
      loader.src = chrome.runtime.getURL('inject/loader.js');
      loader.type = 'text/javascript';
      loader.onload = () => {
        console.log(LOG_PREFIX, 'loader.js injected');
        loader.remove();
      };
      (document.head || document.documentElement).appendChild(loader);

      // inject.js (uses Store for chat detection)
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject/inject.js');
      script.type = 'text/javascript';

      script.onload = () => {
        injected = true;
        injectLoaded = true;
        log('inject.js loaded successfully into page context.');
        script.remove();
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

  // Walk every attribute on `el` looking for "PHONE@c.us"; return the phone
  // string or null. Modern WA Web rotates the attribute name often (data-id,
  // data-list-item-id, data-testid, aria-labelledby, id, etc.) — scanning
  // them all is more resilient than guessing.
  function phoneFromAnyAttr(el) {
    if (!el || !el.attributes) return null;
    for (let i = 0; i < el.attributes.length; i++) {
      const v = el.attributes[i].value || '';
      const m = v.match(/(\d{10,15})@c\.us/);
      if (m) return m[1];
    }
    return null;
  }

  // React 16+ stores component data on DOM nodes under property names like
  // `__reactProps$<rand>` and `__reactFiber$<rand>`. Modern WA Web stripped
  // every @c.us identifier from rendered HTML, so this is the only way to
  // recover the phone for a chat row without round-tripping through Store.
  function getReactInternalKeys(el) {
    if (!el) return null;
    let propsKey = null;
    let fiberKey = null;
    const keys = Object.keys(el);
    for (const k of keys) {
      if (!propsKey && k.startsWith('__reactProps$')) propsKey = k;
      if (!fiberKey && (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))) fiberKey = k;
      if (propsKey && fiberKey) break;
    }
    return (propsKey || fiberKey) ? { propsKey, fiberKey } : null;
  }

  // Walk up the React fiber tree looking for an object that exposes a chat
  // id / wid / contact identifier. Bounded by maxDepth so we don't loop on
  // weird fiber graphs. Returns { phone, name } or null.
  function chatInfoFromFiber(rootEl) {
    try {
      const keys = getReactInternalKeys(rootEl);
      if (!keys) return null;

      function readId(obj) {
        if (!obj || typeof obj !== 'object') return null;
        const id = obj.id || obj.wid || obj.contactId;
        if (!id) return null;
        const ser = id._serialized || (typeof id === 'string' ? id : null) || (id.toString && id.toString());
        if (typeof ser !== 'string' || !ser.endsWith('@c.us')) return null;
        const m = ser.match(/(\d{10,15})@c\.us/);
        return m ? m[1] : null;
      }
      function readName(obj) {
        if (!obj || typeof obj !== 'object') return null;
        return obj.name || obj.formattedTitle || obj.pushname || obj.formattedName || obj.shortName || null;
      }

      // Try the props object first — usually the cleanest source.
      if (keys.propsKey) {
        const p = rootEl[keys.propsKey] || {};
        const candidates = [p.chat, p.contact, p, p.props];
        for (const c of candidates) {
          const phone = readId(c);
          if (phone) return { phone, name: readName(c) || readName(p.chat?.contact) || '' };
        }
      }

      // Then walk up the fiber chain — stop at a reasonable depth.
      let fiber = keys.fiberKey ? rootEl[keys.fiberKey] : null;
      let depth = 0;
      while (fiber && depth < 30) {
        const sources = [fiber.memoizedProps, fiber.pendingProps, fiber.stateNode, fiber.memoizedState];
        for (const src of sources) {
          if (!src || typeof src !== 'object') continue;
          const candidates = [src, src.chat, src.contact];
          for (const c of candidates) {
            const phone = readId(c);
            if (phone) return { phone, name: readName(c) || readName(src.chat?.contact) || '' };
          }
        }
        fiber = fiber.return;
        depth++;
      }
    } catch (_) { /* fiber walk can throw on edge cases — swallow */ }
    return null;
  }

  function extractVisibleChatContacts() {
    const contacts = new Map();
    const pane = findChatListPane();
    if (!pane) return contacts;

    // Find row containers. Modern WA uses [role="row"] with a data-testid
    // like "list-item-N"; older builds expose data-id directly.
    let rows = pane.querySelectorAll('[role="listitem"]');
    if (!rows.length) rows = pane.querySelectorAll('[role="row"]');
    if (!rows.length) rows = pane.querySelectorAll('[data-id]');

    function readNameFromRow(row) {
      const nameEl =
        row.querySelector('[data-testid="cell-frame-title"] span[dir="auto"]') ||
        row.querySelector('[data-testid="cell-frame-title"] span') ||
        row.querySelector('[title]:not([title=""])') ||
        row.querySelector('span[dir="auto"]') ||
        row.querySelector('span[title]');
      const raw = (nameEl?.getAttribute('title') || nameEl?.textContent || '').trim();
      return /^[\d\s\+\-\(\)]+$/.test(raw) ? '' : raw;
    }

    rows.forEach(row => {
      // 1) Cheap path: scan attributes on the row + descendants for @c.us.
      let phone = phoneFromAnyAttr(row);
      let name = null;
      if (!phone) {
        const descendants = row.querySelectorAll('*');
        for (const d of descendants) {
          phone = phoneFromAnyAttr(d);
          if (phone) break;
        }
      }

      // 2) Modern WA strips @c.us from HTML entirely; fall back to React
      //    Fiber introspection. Try the row first, then key descendants
      //    that typically carry the chat model in props (cell-frame-*).
      if (!phone) {
        const fiberTargets = [
          row,
          row.querySelector('[data-testid="cell-frame-container"]'),
          row.querySelector('[data-testid="cell-frame"]'),
          row.firstElementChild,
        ].filter(Boolean);
        for (const t of fiberTargets) {
          const info = chatInfoFromFiber(t);
          if (info?.phone) {
            phone = info.phone;
            if (info.name) name = info.name;
            break;
          }
        }
      }

      if (!phone) return;
      if (name == null) name = readNameFromRow(row);
      if (!contacts.has(phone)) contacts.set(phone, { phone, name: name || '' });
    });

    return contacts;
  }

  // Ask inject.js for the full chat list via the WA Store API. Returns
  // null on timeout or store unavailability so the caller can fall back to
  // DOM scraping. Filters by cutoffMs (last message timestamp) when given.
  function getAllChatsViaStore(cutoffMs) {
    return new Promise((resolve) => {
      const requestId = 'q10-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 4000);

      function handler(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.type !== 'Q10_ALL_CHATS' || d.requestId !== requestId) return;
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        if (!d.ok) { resolve(null); return; }
        const cutoffSec = cutoffMs ? Math.floor(cutoffMs / 1000) : 0;
        const filtered = (d.chats || []).filter(c => {
          if (!cutoffSec) return true;
          if (!c.lastMsgTimestamp) return true; // unknown ts — keep
          return c.lastMsgTimestamp >= cutoffSec;
        });
        resolve(filtered);
      }

      window.addEventListener('message', handler);
      window.postMessage({ type: 'Q10_GET_ALL_CHATS', requestId: requestId }, '*');
    });
  }

  async function runBatchExtraction(cutoffMs) {
    const myGen = ++batchGen;
    batchExtracting = true;
    const allContacts = new Map();

    log('[batch] starting extraction. cutoffMs:', cutoffMs);

    // Preferred path: WA Store API via inject.js (covers all chats at once,
    // no scrolling, no virtualization gymnastics). Falls back to DOM scraping
    // if the Store isn't ready or the response times out.
    const storeChats = await getAllChatsViaStore(cutoffMs);
    if (myGen !== batchGen) return;
    if (storeChats && storeChats.length) {
      storeChats.forEach(c => allContacts.set(c.phone, { phone: c.phone, name: c.name || '' }));
      log('[batch] store extraction succeeded. contacts:', allContacts.size);
      chrome.runtime.sendMessage({ action: 'batchExtractProgress', count: allContacts.size });
      batchExtracting = false;
      const result = Array.from(allContacts.values());
      chrome.runtime.sendMessage({ action: 'batchExtractComplete', ok: true, data: result });
      return;
    }
    log('[batch] store extraction unavailable or empty, falling back to DOM scraping');

    const pane = findChatListPane();
    log('[batch] pane found:', !!pane);

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
      // Dump diagnostics so we can see why the scraper failed. Most common
      // cause is a fresh WA Web bundle that hides @c.us identifiers from the
      // DOM entirely. The user can paste this snippet back to us.
      try {
        const firstRow = pane?.querySelector('[role="listitem"]') || pane?.querySelector('[role="row"]') || pane?.firstElementChild;
        const fiberKeys = firstRow ? Object.keys(firstRow).filter(k => k.startsWith('__react')) : [];
        let propsSummary = null;
        if (fiberKeys.length) {
          const propsKey = fiberKeys.find(k => k.startsWith('__reactProps$'));
          if (propsKey) {
            const p = firstRow[propsKey];
            propsSummary = p ? Object.keys(p).slice(0, 20) : null;
          }
        }
        // Also peek at the cell-frame-container's props since that's where
        // the chat model usually lives in the React tree.
        const cellFrame = firstRow?.querySelector('[data-testid="cell-frame-container"]');
        let cellPropsSummary = null;
        if (cellFrame) {
          const cellPropsKey = Object.keys(cellFrame).find(k => k.startsWith('__reactProps$'));
          if (cellPropsKey) {
            const p = cellFrame[cellPropsKey];
            cellPropsSummary = p ? Object.keys(p).slice(0, 20) : null;
          }
        }

        const paneDump = pane ? {
          tag: pane.tagName,
          id: pane.id,
          ariaLabel: pane.getAttribute('aria-label'),
          role: pane.getAttribute('role'),
          listItemCount: pane.querySelectorAll('[role="listitem"]').length,
          rowCount: pane.querySelectorAll('[role="row"]').length,
          dataIdCount: pane.querySelectorAll('[data-id]').length,
          firstRowFiberKeys: fiberKeys,
          firstRowPropsKeys: propsSummary,
          firstCellFramePropsKeys: cellPropsSummary,
          firstRowSnippet: firstRow?.outerHTML?.slice(0, 400) || null
        } : null;
        log('[batch] DIAGNOSTIC dump (paste this back if 0 contacts):', JSON.stringify(paneDump, null, 2));
      } catch (e) { warn('[batch] diagnostic dump failed:', e.message); }

      chrome.runtime.sendMessage({
        action: 'batchExtractComplete',
        ok: false,
        error: 'Nenhuma conversa individual encontrada. Abra o DevTools (F12) na aba do WhatsApp Web, copie o "[batch] DIAGNOSTIC dump" do console e envie ao suporte para atualizar os seletores.'
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
