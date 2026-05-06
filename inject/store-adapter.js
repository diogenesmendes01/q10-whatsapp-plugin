/* ============================================================
   Q10 CRM — WhatsApp Store Adapter
   
   Abstraction layer over WhatsApp Web's internal undocumented
   Store APIs (window.Store, webpack modules, etc.).
   
   This module provides:
   - A clean, documented interface to Store functionality
   - Graceful degradation when Store is unavailable
   - Detection of Store API breakage after WhatsApp updates
   - Multiple strategies to locate the Store
   
   WHY THIS EXISTS:
   WhatsApp Web uses internal JavaScript APIs that are NOT part
   of their public documentation. These live in the global
   `window.Store` object and related webpack modules. Meta can
   change these at any time without notice, breaking the plugin.
   
   DOCUMENTED Store METHODS USED:
   ============================================================
   
   Collection: window.Store.Chat (ChatCollection)
   -----------------------------------------------
   .get(chatId: string): ChatModel | null
     → Retrieve a specific chat by its ID
     → Used for: looking up rich chat data from DOM-detected ID
   
   .getActive(): ChatModel | null
     → Get the currently active/selected chat
     → Used for: detecting which chat is open
   
   .getModelsArray(): ChatModel[]
     → Get all chat models as an array
     → Used for: finding the active chat by .active flag
   
   .on(event: string, callback: Function): void
     → Subscribe to collection change events
     → Events used: 'change:active' — fires when active chat changes
     → Used for: real-time chat switch detection
   
   Collection: window.Store.Contact (ContactCollection)
   ------------------------------------------------------
   .get(contactId: string): ContactModel | null
     → Retrieve a contact by ID
     → Used for: getting pushname/profile pic for a chat
   
   .getModelsArray(): ContactModel[]
     → Get all contacts
   
   Collection: window.Store.Msg (MsgCollection)
   --------------------------------------------
   .get(msgId: string): MsgModel | null
     → Retrieve a specific message
   
   Object: window.Store.Conn (ConnService)
   ---------------------------------------
   .wid: string
     → The current user's WhatsApp ID (phone number)
   
   Object: window.Store.Cmd
   ------------------------
   .openChatBottom(chatId: string): void
     → Programmatically open chat panel
   
   ChatModel properties used:
   --------------------------
   .id._serialized: string  — Full chat ID (e.g. "5519988145438@c.us")
   .id.toString(): string   — Same as above
   .name: string | null     — Display name
   .formattedTitle: string  — Formatted name
   .active: boolean         — Whether chat is currently selected
   .isActive: boolean       — Alternative active flag
   .contact: ContactModel   — Associated contact object
   .contact.pushname: string — WhatsApp-defined push name
   .contact.formattedName: string — Formatted contact name
   .contact.profilePicThumb.eurl: string — Profile pic URL
   
   ContactModel properties used:
   -----------------------------
   .id._serialized: string — Contact ID
   .pushname: string | null — WhatsApp push name
   .formattedName: string — Formatted display name
   .name: string — Given name
   .shortName: string | null — Short name
   .profilePicThumb.eurl: string | null — Profile pic URL
   
   ============================================================
   GRACEFUL DEGRADATION:
   If Store is unavailable (WhatsApp updated, not loaded yet, etc.)
   the adapter returns null for lookups and the caller falls back
   to DOM-based detection. No errors are thrown.
   
   BREAKAGE DETECTION:
   After initial successful load, any subsequent error when calling
   Store methods sets a "degraded" flag. After 3 consecutive errors,
   the Store is marked as "broken" and all methods return null.
   A 'Q10_STORE_BROKEN' message is posted so the inject script knows
   to rely entirely on DOM fallback.
   ============================================================ */

(function (global) {
  'use strict';

  const TAG = '[Q10 StoreAdapter]';
  var CONSECUTIVE_ERROR_THRESHOLD = 3;

  // ──────────────────────────────────────────────────────────────
  //  State
  // ──────────────────────────────────────────────────────────────
  var storeRef = null;  // Raw store reference, null = unresolved, 'broken' = failed
  var errorCount = 0;
  var degraded = false;
  var broken = false;

  // ──────────────────────────────────────────────────────────────
  //  Module detection predicates
  // ──────────────────────────────────────────────────────────────
  var STORE_MODULE_CHECKS = {
    Chat:    function(m) { return m.Chat && m.Chat.get && (m.Chat.getModelsArray || m.Chat.getArray); },
    Contact: function(m) { return m.Contact && m.Contact.get && m.Contact.getModelsArray; },
    Msg:     function(m) { return m.Msg && m.Msg.get; },
    Conn:    function(m) { return m.Conn && m.Conn.wid; },
    Cmd:     function(m) { return m.Cmd && m.Cmd.openChatBottom; }
  };

  // ──────────────────────────────────────────────────────────────
  //  Error tracking
  // ──────────────────────────────────────────────────────────────
  function trackError(err) {
    if (broken || degraded) return;
    errorCount++;
    if (errorCount >= CONSECUTIVE_ERROR_THRESHOLD) {
      broken = true;
      console.error(TAG, 'Store marked BROKEN after', errorCount, 'consecutive errors:', err ? err.message || err : '');
      try {
        global.postMessage({ type: 'Q10_STORE_BROKEN', errorCount: errorCount }, '*');
      } catch (_) { /* ignore */ }
    }
  }

  function trackSuccess() {
    errorCount = 0;
  }

  // ──────────────────────────────────────────────────────────────
  //  Strategy 0: Comet runtime (WhatsApp Web >= 2.3000, post-Webpack)
  //
  //  Modern WA Web replaced its Webpack module system with a Meta-internal
  //  "Comet" loader. Module IDs are now string names (e.g. "WAWebChatCollection")
  //  exposed through `require('__debug').modulesMap` and loadable via
  //  `importNamespace(id)`. Pattern reverse-engineered from wppconnect/wa-js
  //  (https://github.com/wppconnect-team/wa-js/blob/main/src/loader/index.ts)
  //  and pedroslopez/whatsapp-web.js PR #2816.
  // ──────────────────────────────────────────────────────────────
  function strategyCometDebug() {
    var diag = '[Strategy 0/Comet]';
    try {
      // Modern WA exposes `require` and `importNamespace` on either `self` or
      // `window`. They're the same object in the main thread but reading both
      // explicitly is cheap insurance.
      var req = (typeof global.require === 'function') ? global.require
              : (typeof self !== 'undefined' && typeof self.require === 'function') ? self.require
              : null;
      if (!req) {
        console.log(TAG, diag, 'require() not available (typeof window.require:', typeof global.require + ')');
        return null;
      }

      var debugMod = null;
      try { debugMod = req('__debug'); } catch (e) {
        console.log(TAG, diag, 'require("__debug") threw:', e.message);
        return null;
      }
      if (!debugMod) {
        console.log(TAG, diag, '__debug returned falsy:', debugMod);
        return null;
      }
      if (!debugMod.modulesMap) {
        console.log(TAG, diag, '__debug.modulesMap missing. Keys on __debug:', Object.keys(debugMod).slice(0, 10));
        return null;
      }

      var allIds = Object.keys(debugMod.modulesMap);
      console.log(TAG, diag, 'modulesMap has', allIds.length, 'modules');

      // If the canonical id isn't there, dump every chat-related id we can
      // find so the user can paste them back and we can adjust the names.
      if (!debugMod.modulesMap['WAWebChatCollection']) {
        var chatIsh = allIds.filter(function(k) { return /chat/i.test(k); }).slice(0, 30);
        console.log(TAG, diag, 'WAWebChatCollection missing. Chat-related modules sample:', chatIsh);
        return null;
      }

      var importNs = (typeof global.importNamespace === 'function') ? global.importNamespace
                   : (typeof self !== 'undefined' && typeof self.importNamespace === 'function') ? self.importNamespace
                   : null;

      function loadCollection(id, fallbackProp) {
        try {
          var mod = importNs ? importNs(id) : req(id);
          if (!mod) {
            console.log(TAG, diag, 'module', id, 'returned falsy');
            return null;
          }
          var col = mod.default || (fallbackProp && mod[fallbackProp]) || null;
          if (!col) {
            console.log(TAG, diag, 'module', id, 'loaded but no default/' + fallbackProp + '. Keys:', Object.keys(mod).slice(0, 15));
          }
          return col;
        } catch (e) {
          console.log(TAG, diag, 'load', id, 'threw:', e.message);
          return null;
        }
      }

      var ChatCol = loadCollection('WAWebChatCollection', 'ChatCollection');
      if (!ChatCol) {
        console.log(TAG, diag, 'ChatCollection load returned null');
        return null;
      }
      if (typeof ChatCol.get !== 'function') {
        console.log(TAG, diag, 'ChatCol.get is not a function. Methods:', Object.keys(ChatCol).slice(0, 15));
        return null;
      }

      var ContactCol = loadCollection('WAWebContactCollection', 'ContactCollection');
      var MsgCol = loadCollection('WAWebMsgCollection', 'MsgCollection');

      console.log(TAG, diag, 'ChatCollection found, Contact:', !!ContactCol, 'Msg:', !!MsgCol);
      return {
        Chat:    ChatCol,
        Contact: ContactCol,
        Msg:     MsgCol,
        Conn:    null
      };
    } catch (err) {
      console.warn(TAG, diag, 'unexpected error:', err.message);
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────────
  //  Strategy 1: Direct window.Store
  // ──────────────────────────────────────────────────────────────
  function strategyDirectWindowStore() {
    try {
      if (global.Store && global.Store.Chat && global.Store.Chat.get) {
        console.log(TAG, 'Strategy 1 (direct window.Store): Store found');
        return global.Store;
      }
    } catch (_) { /* not available */ }
    return null;
  }

  // ──────────────────────────────────────────────────────────────
  //  Strategy 2: webpackChunkwhatsapp_web_client module search
  // ──────────────────────────────────────────────────────────────
  function searchWebpackModules() {
    try {
      var chunk = global.webpackChunkwhatsapp_web_client;
      if (!chunk || chunk.length === 0) return null;

      var moduleId = '__q10_adapter_probe_' + Date.now();
      var modules = null;

      chunk.push([
        [moduleId],
        {},
        function (require) {
          modules = require;
        }
      ]);

      if (!modules || !modules.m) return null;

      var found = {};

      var keys = Object.keys(modules.m);
      for (var i = 0; i < keys.length; i++) {
        try {
          var mod = modules(keys[i]);
          if (!mod || typeof mod !== 'object') continue;

          var name;
          for (name in STORE_MODULE_CHECKS) {
            if (!found[name]) {
              try {
                if (STORE_MODULE_CHECKS[name](mod)) {
                  found[name] = mod[name];
                } else if (mod.default && STORE_MODULE_CHECKS[name](mod.default)) {
                  found[name] = mod.default[name];
                }
              } catch (_) { /* skip */ }
            }
          }
        } catch (_) { /* skip */ }
      }

      if (found.Chat) {
        console.log(TAG, 'Strategy 2 (webpack search): found modules:', Object.keys(found).join(', '));
        return found;
      }
    } catch (err) {
      console.warn(TAG, 'Strategy 2 error:', err.message);
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────────
  //  Strategy 3: window.require('WAWebCollections')
  // ──────────────────────────────────────────────────────────────
  function strategyRequireCollections() {
    try {
      if (typeof global.require === 'function') {
        var collections = global.require('WAWebCollections');
        if (collections && collections.ChatCollection) {
          console.log(TAG, 'Strategy 3 (WAWebCollections require): found collections');
          return {
            Chat:    collections.ChatCollection,
            Contact: collections.ContactCollection || null,
            Msg:     collections.MsgCollection || null
          };
        }
      }
    } catch (_) { /* not available */ }
    return null;
  }

  // ──────────────────────────────────────────────────────────────
  //  Strategy 4: Scan window properties for Store-like objects
  // ──────────────────────────────────────────────────────────────
  function strategyWindowSearch() {
    try {
      var candidates = Object.keys(global).filter(function(key) {
        try {
          var val = global[key];
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
        console.log(TAG, 'Strategy 4 (window scan): found Store-like at window.' + candidates[0]);
        return global[candidates[0]];
      }
    } catch (err) {
      console.warn(TAG, 'Strategy 4 error:', err.message);
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────────
  //  Public init — resolve the Store
  //
  //  Returns true when storeRef is set to a usable object. On WhatsApp Web
  //  Comet builds the modules can take a few seconds to load after the page
  //  starts evaluating, so we deliberately do NOT cache a permanent failure
  //  state — the next call (e.g. when the user clicks "Extrair Contatos"
  //  later in the session) can succeed even if the boot-time call didn't.
  //  Once `broken` is set via consecutive runtime errors that's a different
  //  story, but a missed first resolve isn't fatal.
  // ──────────────────────────────────────────────────────────────
  function resolveStore() {
    if (storeRef && storeRef !== 'broken') return true;
    if (broken) return false;

    var strategies = [
      strategyCometDebug,         // Modern WA Web (>= 2.3000, post-Webpack)
      strategyDirectWindowStore,
      strategyRequireCollections,
      strategyWindowSearch,
      searchWebpackModules
    ];

    for (var i = 0; i < strategies.length; i++) {
      try {
        var result = strategies[i]();
        if (result) {
          storeRef = result;
          trackSuccess();
          console.log(TAG, 'Store resolved successfully via', strategies[i].name);
          return true;
        }
      } catch (err) {
        console.warn(TAG, strategies[i].name, 'threw:', err.message);
      }
    }

    // Leave storeRef as null so the next call can retry — modules may not
    // have loaded yet at the time of bootstrap.
    storeRef = null;
    return false;
  }

  // ──────────────────────────────────────────────────────────────
  //  Public API — Safe wrappers with error tracking
  // ──────────────────────────────────────────────────────────────

  var _retryCount = 0;
  function isAvailable() {
    if (broken) return false;
    if (storeRef && storeRef !== 'broken') return true;
    // Lazy retry — modules may have loaded since the boot-time attempt.
    _retryCount++;
    console.log(TAG, 'Lazy retry #' + _retryCount + ' — re-attempting Store resolution');
    return resolveStore();
  }

  function isBroken() {
    return broken;
  }

  function getRawStore() {
    return isAvailable() ? storeRef : null;
  }

  function getChatById(chatId) {
    if (!isAvailable() || broken) return null;
    try {
      trackSuccess();
      return storeRef.Chat.get(chatId);
    } catch (err) {
      trackError(err);
      return null;
    }
  }

  function getActiveChat() {
    if (!isAvailable() || broken) return null;
    try {
      trackSuccess();
      if (typeof storeRef.Chat.getActive === 'function') {
        var chat = storeRef.Chat.getActive();
        if (chat) return chat;
      }
      if (typeof storeRef.Chat.getModelsArray === 'function') {
        var chats = storeRef.Chat.getModelsArray();
        for (var i = 0; i < chats.length; i++) {
          if (chats[i].active || chats[i].isActive) return chats[i];
        }
      }
      return null;
    } catch (err) {
      trackError(err);
      return null;
    }
  }

  function getAllChats() {
    if (!isAvailable() || broken) return [];
    try {
      trackSuccess();
      if (typeof storeRef.Chat.getModelsArray === 'function') return storeRef.Chat.getModelsArray();
      if (typeof storeRef.Chat.getArray === 'function') return storeRef.Chat.getArray();
      return [];
    } catch (err) {
      trackError(err);
      return [];
    }
  }

  function onActiveChatChange(callback) {
    if (!isAvailable() || broken) return null;
    try {
      trackSuccess();
      if (typeof storeRef.Chat.on === 'function') {
        storeRef.Chat.on('change:active', callback);
        return function() {
          try {
            if (typeof storeRef.Chat.off === 'function') {
              storeRef.Chat.off('change:active', callback);
            }
          } catch (_) { /* ignore */ }
        };
      }
    } catch (err) {
      trackError(err);
    }
    return null;
  }

  function getContactById(contactId) {
    if (!isAvailable() || broken) return null;
    if (!storeRef.Contact) return null;
    try {
      trackSuccess();
      return storeRef.Contact.get(contactId);
    } catch (err) {
      trackError(err);
      return null;
    }
  }

  function getCurrentWid() {
    if (!isAvailable() || broken) return null;
    try {
      trackSuccess();
      return storeRef.Conn && storeRef.Conn.wid ? storeRef.Conn.wid : null;
    } catch (err) {
      trackError(err);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Bootstrap
  // ──────────────────────────────────────────────────────────────
  function bootstrap() {
    var success = resolveStore();

    if (success) {
      console.log(TAG, 'Store resolved — Adapter ready');
      try {
        global.postMessage({ type: 'Q10_ADAPTER_READY', collections: Object.keys(storeRef).join(', ') }, '*');
      } catch (_) { /* ignore */ }
    } else {
      console.warn(TAG, 'Store could not be resolved — Adapter unavailable');
      try {
        global.postMessage({ type: 'Q10_ADAPTER_UNAVAILABLE' }, '*');
      } catch (_) { /* ignore */ }
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Expose public API
  // ──────────────────────────────────────────────────────────────
  global.Q10StoreAdapter = {
    resolveStore: resolveStore,
    isAvailable: isAvailable,
    isBroken: isBroken,
    getRawStore: getRawStore,
    getChatById: getChatById,
    getActiveChat: getActiveChat,
    getAllChats: getAllChats,
    onActiveChatChange: onActiveChatChange,
    getContactById: getContactById,
    getCurrentWid: getCurrentWid
  };

  // Auto-bootstrap
  bootstrap();

})(typeof global !== 'undefined' ? global : window);
