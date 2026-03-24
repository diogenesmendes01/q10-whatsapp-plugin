/* ============================================================
   Q10 CRM — Store Loader (WhatsApp Web)
   Finds and exposes WhatsApp Web's internal Store object
   using multiple strategies with retry/fallback.

   Runs in PAGE context (injected via <script> tag).
   ============================================================ */

(function () {
  'use strict';

  const TAG = '[Q10 Inject]';
  const MAX_RETRIES = 50;        // ~25 seconds total
  const RETRY_INTERVAL = 500;    // ms between retries

  // Avoid double-init
  if (window.__q10StoreLoaded) {
    console.log(TAG, 'Store loader already running, skipping.');
    return;
  }
  window.__q10StoreLoaded = true;

  /**
   * The Store object we're looking for has these key collections:
   * - Chat: active chats
   * - Contact: contacts
   * - Msg: messages
   * - Conn: connection info
   */
  const STORE_MODULES = {
    Chat:    (m) => m.Chat && m.Chat.get && m.Chat.getModelsArray,
    Contact: (m) => m.Contact && m.Contact.get && m.Contact.getModelsArray,
    Msg:     (m) => m.Msg && m.Msg.get,
    Conn:    (m) => m.Conn && m.Conn.wid,
    Cmd:     (m) => m.Cmd && m.Cmd.openChatBottom,
  };

  // Will hold the resolved Store
  window.Q10Store = null;

  // ================================================================
  //  Strategy 1: Intercept webpackChunkwhatsapp_web_client push
  // ================================================================
  function strategyWebpackIntercept() {
    return new Promise((resolve) => {
      const chunk = window.webpackChunkwhatsapp_web_client;
      if (!chunk) {
        resolve(null);
        return;
      }

      console.log(TAG, 'Strategy 1: Intercepting webpack chunk push...');

      let resolved = false;
      const originalPush = chunk.push.bind(chunk);

      chunk.push = function (args) {
        const result = originalPush(args);

        if (!resolved) {
          // After a chunk is loaded, try to find store modules
          const store = searchModulesInWebpack();
          if (store) {
            resolved = true;
            chunk.push = originalPush; // restore
            resolve(store);
          }
        }

        return result;
      };

      // Also try immediately in case modules are already loaded
      const immediate = searchModulesInWebpack();
      if (immediate) {
        resolved = true;
        chunk.push = originalPush;
        resolve(immediate);
      }

      // Timeout — don't hang forever on this strategy
      setTimeout(() => {
        if (!resolved) {
          chunk.push = originalPush;
          resolve(null);
        }
      }, 10000);
    });
  }

  // ================================================================
  //  Strategy 2: Search through webpack require/modules
  // ================================================================
  function searchModulesInWebpack() {
    try {
      const chunk = window.webpackChunkwhatsapp_web_client;
      if (!chunk || chunk.length === 0) return null;

      let modules = null;

      // Inject a fake module to get access to the require function
      const moduleId = '__q10_probe_' + Date.now();
      chunk.push([
        [moduleId],
        {},
        function (require) {
          modules = require;
        },
      ]);

      if (!modules || !modules.m) return null;

      const store = {};
      const moduleKeys = Object.keys(modules.m);

      for (const key of moduleKeys) {
        try {
          const mod = modules(key);
          if (!mod || typeof mod !== 'object') continue;

          // Check each target module
          for (const [name, test] of Object.entries(STORE_MODULES)) {
            if (!store[name]) {
              try {
                if (test(mod)) {
                  store[name] = mod[name];
                }
              } catch (_) { /* skip */ }
            }
          }

          // Also check mod.default
          if (mod.default && typeof mod.default === 'object') {
            for (const [name, test] of Object.entries(STORE_MODULES)) {
              if (!store[name]) {
                try {
                  if (test(mod.default)) {
                    store[name] = mod.default[name];
                  }
                } catch (_) { /* skip */ }
              }
            }
          }
        } catch (_) {
          // Some modules throw on access — skip
        }
      }

      // Need at minimum Chat to be useful
      if (store.Chat) {
        console.log(TAG, 'Found Store modules:', Object.keys(store).join(', '));
        return store;
      }

      return null;
    } catch (err) {
      console.warn(TAG, 'searchModulesInWebpack error:', err.message);
      return null;
    }
  }

  // ================================================================
  //  Strategy 3: Look for window.Store (some WA versions expose it)
  // ================================================================
  function strategyWindowStore() {
    if (window.Store && window.Store.Chat) {
      console.log(TAG, 'Strategy 3: Found window.Store directly');
      return window.Store;
    }
    return null;
  }

  // ================================================================
  //  Strategy 4: Search window properties for Store-like objects
  // ================================================================
  function strategyWindowSearch() {
    try {
      const candidates = Object.keys(window).filter((key) => {
        try {
          const val = window[key];
          return (
            val &&
            typeof val === 'object' &&
            val.Chat &&
            typeof val.Chat.get === 'function'
          );
        } catch (_) {
          return false;
        }
      });

      if (candidates.length > 0) {
        console.log(TAG, 'Strategy 4: Found Store-like object at window.' + candidates[0]);
        return window[candidates[0]];
      }
    } catch (err) {
      console.warn(TAG, 'strategyWindowSearch error:', err.message);
    }
    return null;
  }

  // ================================================================
  //  Strategy 5: Use require('WAWebCollections') if available
  // ================================================================
  function strategyRequire() {
    try {
      if (typeof window.require === 'function') {
        const collections = window.require('WAWebCollections');
        if (collections && collections.ChatCollection) {
          console.log(TAG, 'Strategy 5: Found via WAWebCollections require');
          return {
            Chat: collections.ChatCollection,
            Contact: collections.ContactCollection || null,
            Msg: collections.MsgCollection || null,
          };
        }
      }
    } catch (_) { /* not available */ }
    return null;
  }

  // ================================================================
  //  Master loader — tries all strategies with polling
  // ================================================================
  async function loadStore() {
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      attempt++;

      // Quick strategies first
      let store = strategyWindowStore();
      if (store) return store;

      store = strategyRequire();
      if (store) return store;

      store = strategyWindowSearch();
      if (store) return store;

      // Webpack search (heavier)
      store = searchModulesInWebpack();
      if (store) return store;

      if (attempt === 1) {
        console.log(TAG, 'Store not available yet, polling...');
        // Try webpack intercept in parallel (only once)
        strategyWebpackIntercept().then((s) => {
          if (s && !window.Q10Store) {
            window.Q10Store = s;
            announceStoreReady(s);
          }
        });
      }

      await sleep(RETRY_INTERVAL);
    }

    return null;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function announceStoreReady(store) {
    console.log(TAG, '✅ Store loaded! Available collections:', Object.keys(store).join(', '));
    window.postMessage({ type: 'Q10_STORE_READY', collections: Object.keys(store) }, '*');
  }

  // ================================================================
  //  Init
  // ================================================================
  (async function init() {
    console.log(TAG, 'Store loader starting...');

    const store = await loadStore();

    if (store) {
      window.Q10Store = store;
      announceStoreReady(store);
    } else {
      console.warn(TAG, '⚠️ Could not find WhatsApp Store after', MAX_RETRIES, 'attempts.');
      console.warn(TAG, 'Falling back to DOM-based detection.');
      window.postMessage({ type: 'Q10_STORE_FALLBACK' }, '*');
    }
  })();
})();
