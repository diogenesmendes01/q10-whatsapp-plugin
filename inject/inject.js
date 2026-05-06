/* ============================================================
   Q10 CRM — Inject Script (WhatsApp Web)
   Uses the Q10StoreAdapter abstraction layer for safe access
   to WhatsApp Web's internal Store APIs.

   Communication: window.postMessage ↔ content script

   v2.0 — Q10StoreAdapter-based detection + DOM fallback
   ============================================================ */

(function () {
  'use strict';

  var TAG = '[Q10 Inject]';
  var CHAT_CHANGE_DEBOUNCE = 300; // ms

  // Avoid double-init
  if (window.__q10InjectReady) {
    console.log(TAG, 'Already initialized, skipping.');
    return;
  }
  window.__q10InjectReady = true;

  var lastChatId = null;
  var debounceTimer = null;
  var storeAvailable = false;
  var chatUnsubscribe = null;

  // ──────────────────────────────────────────────────────────────
  //  STORE-BASED CHAT DETECTION (via Q10StoreAdapter)
  // ──────────────────────────────────────────────────────────────

  /**
   * Get the currently active chat using the Q10StoreAdapter.
   * Returns null if Store is unavailable or no chat is open.
   */
  function getCurrentChatFromStore() {
    try {
      var adapter = window.Q10StoreAdapter;
      if (!adapter || !adapter.isAvailable()) return null;
      if (adapter.isBroken()) return null;

      // Get active chat model
      var activeChat = adapter.getActiveChat();

      // If no active, try looking up via DOM-detected chatId
      if (!activeChat) {
        var chatId = getChatIdFromDOM();
        if (chatId) {
          activeChat = adapter.getChatById(chatId);
        }
      }

      if (!activeChat) return null;

      return formatChatData(activeChat, adapter);
    } catch (err) {
      console.warn(TAG, 'getCurrentChatFromStore error:', err.message);
      return null;
    }
  }

  /**
   * Format a Store chat model into the Q10 data shape.
   */
  function formatChatData(chat, adapter) {
    try {
      var id = chat.id && chat.id._serialized ? chat.id._serialized : (chat.id && chat.id.toString ? chat.id.toString() : '');
      var isGroup = id.endsWith('@g.us');

      // Phone resolution. Try the chat id first; if it's an @lid identifier,
      // fall back to the linked contact's id (which is usually @c.us). Modern
      // WA assigns LID to many chats — only the contact carries the phone.
      var phone = null;
      if (!isGroup) {
        phone = cleanPhone(id);
        if (!phone && chat.contact) {
          var cId = chat.contact.id;
          var cIdStr = cId && cId._serialized ? cId._serialized : (cId && cId.toString ? cId.toString() : '');
          phone = cleanPhone(cIdStr);
          if (!phone && chat.contact.userid) {
            phone = cleanPhone(String(chat.contact.userid));
          }
          if (!phone && chat.contact.phoneNumber) {
            phone = cleanPhone(String(chat.contact.phoneNumber));
          }
        }
      }

      // Display name: prefer saved-contact names, but skip values that are
      // just the formatted phone (WA falls back to that for unsaved contacts)
      // and pick the pushname instead — that's the name the contact set on
      // their own WhatsApp account.
      function notDigitsOnly(s) {
        if (!s) return false;
        return !/^[\d\s\+\-\(\)‎‏]+$/.test(String(s));
      }
      var nameCandidates = [
        chat.name,
        chat.formattedTitle,
        chat.contact && chat.contact.formattedName,
        chat.contact && chat.contact.name,
      ];
      var name = null;
      for (var i = 0; i < nameCandidates.length; i++) {
        if (notDigitsOnly(nameCandidates[i])) { name = String(nameCandidates[i]); break; }
      }
      if (!name && chat.contact) {
        if (notDigitsOnly(chat.contact.pushname)) name = String(chat.contact.pushname);
        else if (notDigitsOnly(chat.contact.shortName)) name = String(chat.contact.shortName);
      }
      if (!name && !isGroup && adapter && adapter.isAvailable()) {
        try {
          var contact = adapter.getContactById(chat.id);
          if (contact) {
            var fromAdapter = contact.formattedName || contact.name || contact.pushname || contact.shortName;
            if (notDigitsOnly(fromAdapter)) name = String(fromAdapter);
          }
        } catch (_) { /* skip */ }
      }

      // Optional enrichment available on business accounts.
      var email = null;
      try {
        var bp = chat.contact && chat.contact.businessProfile;
        if (bp && bp.email) email = String(bp.email);
      } catch (_) { /* skip */ }

      var profilePic = null;
      try {
        profilePic = chat.contact && chat.contact.profilePicThumb && chat.contact.profilePicThumb.eurl ? chat.contact.profilePicThumb.eurl : null;
      } catch (_) { /* skip */ }

      return {
        phone: phone,
        name: name || null,
        email: email,
        isGroup: isGroup,
        chatId: id,
        profilePic: profilePic
      };
    } catch (err) {
      console.warn(TAG, 'formatChatData error:', err.message);
      return null;
    }
  }

  /**
   * Clean phone from chatId format: "5519988145438@c.us" → "5519988145438".
   * Returns null for LID identifiers ("12345@lid"), groups, and any value
   * we can't prove is a real phone. Callers must retry via the linked
   * contact for LID chats.
   *
   * Important: do NOT accept bare digits as a phone. LIDs are 14-17 numeric
   * digits and look exactly like long phone numbers; without the @c.us
   * suffix we can't tell them apart.
   */
  function cleanPhone(chatId) {
    if (!chatId) return null;
    var s = String(chatId);
    var match = s.match(/^(\d{10,15})@(?:c\.us|s\.whatsapp\.net)$/);
    return match ? match[1] : null;
  }

  // ──────────────────────────────────────────────────────────────
  //  DOM-BASED FALLBACKS
  // ──────────────────────────────────────────────────────────────

  function getChatIdFromDOM() {
    try {
      var attrIdRegex = /([\w\.\-]+@(?:c\.us|lid|g\.us|s\.whatsapp\.net))/;

      // Scan EVERY [data-id] inside #main; modern WA buries the chat id
      // several levels deep and may render multiple message rows with
      // distinct ids. The first hit that matches our pattern wins.
      var nodes = document.querySelectorAll('#main [data-id]');
      for (var i = 0; i < nodes.length; i++) {
        var dataId = nodes[i].getAttribute('data-id') || '';
        var m = dataId.match(attrIdRegex);
        if (m) return m[1];
      }

      // Conversation panel attributes (older WA builds tucked it here).
      var panel = document.querySelector('[data-testid="conversation-panel-wrapper"], [data-testid="conversation-info-header"]');
      if (panel) {
        var attrs = Array.from(panel.attributes);
        for (var j = 0; j < attrs.length; j++) {
          var pm = attrs[j].value.match(attrIdRegex);
          if (pm) return pm[1];
        }
      }

      // Header bar — sometimes carries the chat id as data-id on a child.
      var headerScope = document.querySelectorAll('#main header [data-id], #main header [data-jid], #main [data-jid]');
      for (var k = 0; k < headerScope.length; k++) {
        var attrs2 = Array.from(headerScope[k].attributes);
        for (var l = 0; l < attrs2.length; l++) {
          var hm = attrs2[l].value.match(attrIdRegex);
          if (hm) return hm[1];
        }
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  function getCurrentChatFromDOM() {
    try {
      var headerEl = document.querySelector('#main header span');
      if (!headerEl) return null;

      var title = (headerEl.textContent || '').trim();
      if (!title) return null;

      var chatId = getChatIdFromDOM();
      var cleanedPhone = cleanPhoneFromText(title);
      var isGroup = chatId ? chatId.endsWith('@g.us') : false;

      // If the chat id is a LID and we have access to the Store, look up the
      // linked contact to recover the real phone number — without this the
      // forms get name only and the user can't search by phone.
      var phone = cleanedPhone || (chatId ? cleanPhone(chatId) : null);
      if (!phone && chatId && chatId.endsWith('@lid') && window.Q10StoreAdapter) {
        try {
          var adapter = window.Q10StoreAdapter;
          if (adapter.isAvailable()) {
            var chat = adapter.getChatById(chatId);
            if (chat && chat.contact && chat.contact.id) {
              phone = cleanPhone(chat.contact.id._serialized || chat.contact.id.toString());
            }
          }
        } catch (_) { /* skip */ }
      }

      return {
        phone: phone,
        name: cleanedPhone ? null : title,
        isGroup: isGroup,
        chatId: chatId || null,
        profilePic: null
      };
    } catch (err) {
      console.warn(TAG, 'getCurrentChatFromDOM error:', err.message);
      return null;
    }
  }

  function cleanPhoneFromText(text) {
    var cleaned = (text || '').replace(/[\s\-\(\)\u200e\u200f\u202a\u202c+]/g, '');
    return /^\d{10,15}$/.test(cleaned) ? cleaned : null;
  }

  function getCurrentChat() {
    var data = null;

    // Re-check adapter availability each call. The store-adapter does lazy
    // module resolution, so a chat opened seconds after page load may
    // succeed even if init() ran before the WA Comet runtime was ready.
    var adapter = window.Q10StoreAdapter;
    if (adapter && adapter.isAvailable()) {
      storeAvailable = true;
      data = getCurrentChatFromStore();
    }

    if (!data) {
      data = getCurrentChatFromDOM();
    }

    // If we got a chat shape but no phone, try one last time via the
    // adapter using the chatId we just discovered. Covers the race where
    // the DOM has the @lid but the store-via-active-chat didn't expose
    // a contact link yet.
    if (data && !data.phone && data.chatId && adapter && adapter.isAvailable()) {
      try {
        var chat = adapter.getChatById(data.chatId);
        if (chat && chat.contact && chat.contact.id) {
          var resolved = cleanPhone(chat.contact.id._serialized || chat.contact.id.toString());
          if (resolved) data.phone = resolved;
        }
      } catch (_) { /* skip */ }
    }

    return data;
  }

  // ──────────────────────────────────────────────────────────────
  //  CHAT CHANGE OBSERVERS
  // ──────────────────────────────────────────────────────────────

  function startChatObserver() {
    var targetNode = document.getElementById('app') || document.body;

    var observer = new MutationObserver(function(mutations) {
      var chatMayHaveChanged = false;

      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === 'childList') {
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            var node = mutation.addedNodes[j];
            if (node.nodeType !== 1) continue;
            if (
              node.id === 'main' ||
              (node.querySelector && (node.querySelector('#main') || node.querySelector('[data-testid="conversation-header"]') || node.querySelector('[data-testid="conversation-panel-wrapper"]'))) ||
              (node.matches && node.matches('#main header *'))
            ) {
              chatMayHaveChanged = true;
              break;
            }
          }
        }

        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'title' &&
          mutation.target.closest &&
          mutation.target.closest('#main header')
        ) {
          chatMayHaveChanged = true;
        }

        if (chatMayHaveChanged) break;
      }

      if (chatMayHaveChanged) {
        debouncedChatChange();
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['title']
    });

    console.log(TAG, 'DOM chat observer started on', targetNode.tagName + '#' + (targetNode.id || ''));
    return observer;
  }

  function debouncedChatChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      var chat = getCurrentChat();
      if (!chat) return;

      var newId = chat.chatId || chat.phone || chat.name;
      if (newId && newId !== lastChatId) {
        lastChatId = newId;
        console.log(TAG, 'Chat changed →', chat.name || chat.phone, chat.isGroup ? '(group)' : '');
        broadcastChatData(chat);
      }
    }, CHAT_CHANGE_DEBOUNCE);
  }

  /**
   * Store-based chat observer via Q10StoreAdapter.
   * Uses event subscription when available, polling as fallback.
   */
  function startStoreObserver() {
    var adapter = window.Q10StoreAdapter;
    if (!adapter || !adapter.isAvailable()) return false;

    // Try event subscription first
    var unsubscribe = adapter.onActiveChatChange(function() {
      console.log(TAG, 'Store: active chat changed');
      debouncedChatChange();
    });

    if (unsubscribe) {
      chatUnsubscribe = unsubscribe;
      console.log(TAG, 'Store-based chat observer started (event subscription)');
      return true;
    }

    // Fallback: polling via adapter
    setInterval(function() {
      if (!storeAvailable) return;
      var chat = getCurrentChatFromStore();
      if (!chat) return;

      var newId = chat.chatId || chat.phone || chat.name;
      if (newId && newId !== lastChatId) {
        lastChatId = newId;
        console.log(TAG, 'Store poll: chat changed →', chat.name || chat.phone);
        broadcastChatData(chat);
      }
    }, 1000);

    console.log(TAG, 'Store-based chat observer started (polling, 1s interval)');
    return true;
  }

  // ──────────────────────────────────────────────────────────────
  //  STORE BREAKAGE DETECTION
  // ──────────────────────────────────────────────────────────────

  function startBreakageObserver() {
    window.addEventListener('message', function(event) {
      if (event.source !== window) return;
      if (event.data && event.data.type === 'Q10_STORE_BROKEN') {
        console.warn(TAG, 'Store API breakage detected — switching to DOM fallback');
        storeAvailable = false;
        if (chatUnsubscribe) {
          try {
            chatUnsubscribe();
          } catch (_) { /* ignore */ }
          chatUnsubscribe = null;
        }
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  //  COMMUNICATION — postMessage
  // ──────────────────────────────────────────────────────────────

  function broadcastChatData(data) {
    if (!data) return;
    window.postMessage({ type: 'Q10_CHAT_DATA', data: data }, '*');
  }

  function startMessageListener() {
    window.addEventListener('message', function(event) {
      if (event.source !== window) return;

      var msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'Q10_GET_CURRENT_CHAT': {
          var chat = getCurrentChat();
          broadcastChatData(chat);
          break;
        }

        case 'Q10_PING': {
          var adapter = window.Q10StoreAdapter;
          window.postMessage({
            type: 'Q10_PONG',
            storeAvailable: storeAvailable,
            storeBroken: adapter ? adapter.isBroken() : true,
            currentChat: getCurrentChat()
          }, '*');
          break;
        }

        case 'Q10_GET_CHAT_BY_ID': {
          var adapter = window.Q10StoreAdapter;
          if (msg.chatId && storeAvailable && adapter && adapter.isAvailable()) {
            try {
              var chatModel = adapter.getChatById(msg.chatId);
              if (chatModel) {
                broadcastChatData(formatChatData(chatModel, adapter));
              }
            } catch (_) { /* ignore */ }
          }
          break;
        }

        case 'Q10_GET_ALL_CHATS': {
          // Pull every chat the WA Store knows about and return a flat list
          // for the batch leads extractor. Skips groups + LID-only chats
          // (community channels etc); resolves LID-keyed chats to their
          // phone number via the linked contact when possible.
          var adapter = window.Q10StoreAdapter;
          var requestId = msg.requestId || null;
          var available = !!(adapter && adapter.isAvailable() && !adapter.isBroken());
          if (!available) {
            window.postMessage({
              type: 'Q10_ALL_CHATS',
              requestId: requestId,
              ok: false,
              error: 'store_unavailable',
              chats: []
            }, '*');
            break;
          }

          // Helper: extract a phone from any of several Wid-shaped objects.
          function phoneFromWid(idObj) {
            if (!idObj) return null;
            var s = idObj._serialized || (typeof idObj === 'string' ? idObj : (idObj.toString && idObj.toString()) || '');
            if (typeof s !== 'string') return null;
            var m = s.match(/^(\d{10,15})@c\.us$/);
            return m ? m[1] : null;
          }
          // Helper: extract a phone from any "user/userid"-shaped numeric field.
          function phoneFromUserid(v) {
            if (v == null) return null;
            var m = String(v).match(/^(\d{10,15})/);
            return m ? m[1] : null;
          }

          try {
            var chats = adapter.getAllChats() || [];
            var out = [];
            var skippedGroup = 0, skippedNoPhone = 0, skippedBroadcast = 0;
            for (var i = 0; i < chats.length; i++) {
              var c = chats[i];
              try {
                var rawId = c.id && c.id._serialized ? c.id._serialized : (c.id && c.id.toString ? c.id.toString() : '');
                if (!rawId) { skippedNoPhone++; continue; }
                if (rawId.endsWith('@g.us')) { skippedGroup++; continue; }
                if (rawId.endsWith('@broadcast') || rawId.endsWith('@newsletter')) { skippedBroadcast++; continue; }

                // Try multiple sources to find the phone number.
                // Modern WA Web identifies many chats by LID (e.g. "12345@lid")
                // instead of @c.us; the phone lives on the linked contact in
                // that case.
                var phone = phoneFromWid(c.id)
                  || phoneFromWid(c.contact && c.contact.id)
                  || phoneFromUserid(c.contact && c.contact.userid)
                  || phoneFromUserid(c.contact && c.contact.phoneNumber);

                if (!phone) { skippedNoPhone++; continue; }

                // Pick the best display name. Saved-contact names take priority
                // (those come from the user's address book), but for unsaved
                // contacts WhatsApp falls back to the formatted phone number
                // for `c.name` / `c.formattedTitle` — in that case we'd rather
                // use the pushname (the profile name the contact set on their
                // own WhatsApp account).
                function notDigitsOnly(s) {
                  if (!s) return false;
                  return !/^[\d\s\+\-\(\)‎‏]+$/.test(String(s));
                }
                var savedCandidates = [
                  c.name,
                  c.formattedTitle,
                  c.contact && c.contact.formattedName,
                  c.contact && c.contact.name
                ];
                var name = '';
                for (var k = 0; k < savedCandidates.length; k++) {
                  if (notDigitsOnly(savedCandidates[k])) { name = String(savedCandidates[k]); break; }
                }
                if (!name && c.contact) {
                  if (notDigitsOnly(c.contact.pushname)) name = String(c.contact.pushname);
                  else if (notDigitsOnly(c.contact.shortName)) name = String(c.contact.shortName);
                }
                if (!name) {
                  try {
                    var contact = adapter.getContactById(c.id);
                    if (contact) {
                      var fromAdapter = contact.formattedName || contact.name || contact.pushname || contact.shortName;
                      if (notDigitsOnly(fromAdapter)) name = String(fromAdapter);
                    }
                  } catch (_) { /* skip */ }
                }

                var ts = (typeof c.t === 'number' ? c.t : (c.lastReceivedKey && c.lastReceivedKey.t) || 0) | 0;
                out.push({ phone: phone, name: name || '', lastMsgTimestamp: ts });
              } catch (_) { /* skip individual chat errors */ }
            }
            console.log('[Q10 Inject] getAllChats: total=' + chats.length + ' kept=' + out.length + ' skipped(group=' + skippedGroup + ' broadcast=' + skippedBroadcast + ' nophone=' + skippedNoPhone + ')');
            window.postMessage({
              type: 'Q10_ALL_CHATS',
              requestId: requestId,
              ok: true,
              chats: out
            }, '*');
          } catch (err) {
            window.postMessage({
              type: 'Q10_ALL_CHATS',
              requestId: requestId,
              ok: false,
              error: err && err.message ? err.message : 'getAllChats_failed',
              chats: []
            }, '*');
          }
          break;
        }

        default:
          break;
      }
    });

    console.log(TAG, 'Message listener started');
  }

  // ──────────────────────────────────────────────────────────────
  //  WAIT FOR #main TO EXIST
  // ──────────────────────────────────────────────────────────────

  function waitForMain() {
    return new Promise(function(resolve) {
      var existing = document.getElementById('main');
      if (existing) {
        resolve();
        return;
      }

      var observer = new MutationObserver(function(_, obs) {
        if (document.getElementById('main')) {
          obs.disconnect();
          resolve();
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });

      setTimeout(function() {
        observer.disconnect();
        resolve();
      }, 60000);
    });
  }

  // ──────────────────────────────────────────────────────────────
  //  INIT
  // ──────────────────────────────────────────────────────────────

  function init() {
    console.log(TAG, 'Inject script starting...');

    startMessageListener();
    startBreakageObserver();

    // Check if adapter already available
    var adapter = window.Q10StoreAdapter;
    if (adapter && adapter.isAvailable()) {
      storeAvailable = true;
      console.log(TAG, 'Store already available');
    } else if (adapter && adapter.isBroken()) {
      storeAvailable = false;
      console.log(TAG, 'Store marked broken before init');
    }

    if (storeAvailable) {
      console.log(TAG, 'Using Store-based detection');
    } else {
      console.log(TAG, 'Using DOM fallback');
    }

    waitForMain().then(function() {
      startChatObserver(); // DOM observer (always)

      if (storeAvailable) {
        startStoreObserver(); // Store observer (when available)
      }

      // Detect initial chat
      setTimeout(function() {
        var initialChat = getCurrentChat();
        if (initialChat) {
          lastChatId = initialChat.chatId || initialChat.phone || initialChat.name;
          console.log(TAG, 'Initial chat:', initialChat.name || initialChat.phone, initialChat.isGroup ? '(group)' : '');
          broadcastChatData(initialChat);
        } else {
          console.log(TAG, 'No chat open yet — waiting for user to open one.');
        }
      }, 500);

      window.postMessage({ type: 'Q10_INJECT_READY', storeAvailable: storeAvailable }, '*');
      console.log(TAG, 'Inject script ready');
    });
  }

  init();
})();
