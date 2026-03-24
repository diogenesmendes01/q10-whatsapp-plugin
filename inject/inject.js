/* ============================================================
   Q10 CRM — Inject Script (WhatsApp Web)
   Runs in PAGE context to access WhatsApp Web's internal
   Store API for reliable chat/contact detection.

   Communication: window.postMessage ↔ content script

   v1.0 — Store-based detection + DOM fallback
   ============================================================ */

(function () {
  'use strict';

  const TAG = '[Q10 Inject]';
  const CHAT_CHANGE_DEBOUNCE = 300; // ms

  // Avoid double-init
  if (window.__q10InjectReady) {
    console.log(TAG, 'Already initialized, skipping.');
    return;
  }
  window.__q10InjectReady = true;

  let lastChatId = null;
  let debounceTimer = null;
  let storeAvailable = false;

  // ================================================================
  //  STORE-BASED CHAT DETECTION
  // ================================================================

  /**
   * Get the currently active chat using the Store API.
   * Returns null if Store is not available or no chat is open.
   */
  function getCurrentChatFromStore() {
    try {
      const store = window.Q10Store;
      if (!store || !store.Chat) return null;

      // Find the active chat — it's the one with "active" or at position 0
      // WhatsApp marks the selected chat differently across versions
      let activeChat = null;

      // Method 1: Chat.getActive (some versions)
      if (typeof store.Chat.getActive === 'function') {
        activeChat = store.Chat.getActive();
      }

      // Method 2: Look for Chat with active=true flag
      if (!activeChat && typeof store.Chat.getModelsArray === 'function') {
        const chats = store.Chat.getModelsArray();
        activeChat = chats.find((c) => c.active || c.isActive);
      }

      // Method 3: Check the currently visible chat via the DOM chatId,
      // then look it up in Store for rich data
      if (!activeChat) {
        const chatId = getChatIdFromDOM();
        if (chatId && typeof store.Chat.get === 'function') {
          activeChat = store.Chat.get(chatId);
        }
      }

      if (!activeChat) return null;

      return formatChatData(activeChat, store);
    } catch (err) {
      console.warn(TAG, 'getCurrentChatFromStore error:', err.message);
      return null;
    }
  }

  /**
   * Format a Store chat model into the Q10 data shape.
   */
  function formatChatData(chat, store) {
    try {
      const id = chat.id?._serialized || chat.id?.toString() || '';
      const isGroup = id.endsWith('@g.us');
      const phone = isGroup ? null : cleanPhone(id);

      // Get contact name (multiple fallbacks)
      let name = null;
      if (chat.name) {
        name = chat.name;
      } else if (chat.formattedTitle) {
        name = chat.formattedTitle;
      } else if (chat.contact) {
        name =
          chat.contact.pushname ||
          chat.contact.formattedName ||
          chat.contact.name ||
          chat.contact.shortName;
      }

      // Try Store.Contact for better name data
      if (!name && store.Contact && !isGroup) {
        try {
          const contact = store.Contact.get(chat.id);
          if (contact) {
            name =
              contact.pushname ||
              contact.formattedName ||
              contact.name ||
              contact.shortName;
          }
        } catch (_) { /* skip */ }
      }

      // Profile pic (if available in model)
      let profilePic = null;
      try {
        profilePic = chat.contact?.profilePicThumb?.eurl || null;
      } catch (_) { /* skip */ }

      return {
        phone: phone,
        name: name || null,
        isGroup: isGroup,
        chatId: id,
        profilePic: profilePic,
      };
    } catch (err) {
      console.warn(TAG, 'formatChatData error:', err.message);
      return null;
    }
  }

  /**
   * Clean phone from chatId format: "5519988145438@c.us" → "5519988145438"
   */
  function cleanPhone(chatId) {
    if (!chatId) return null;
    const match = chatId.match(/^(\d+)@/);
    return match ? match[1] : chatId.replace(/@.*$/, '').replace(/\D/g, '') || null;
  }

  // ================================================================
  //  DOM-BASED FALLBACKS
  // ================================================================

  /**
   * Try to extract the chat ID from the DOM.
   * Used as a bridge to look up the chat in Store.
   */
  function getChatIdFromDOM() {
    try {
      // data-id on messages contains the chat ID
      const msgEl = document.querySelector('#main [data-id]');
      if (msgEl) {
        const dataId = msgEl.getAttribute('data-id') || '';
        // Format: "true_5519988145438@c.us_XXXXXXX" or "false_..."
        const match = dataId.match(/(?:true|false)_(\d+@\w+\.us)/);
        if (match) return match[1];
      }

      // conversation-panel-wrapper sometimes has data attributes
      const panel = document.querySelector('[data-testid="conversation-panel-wrapper"]');
      if (panel) {
        const attrs = Array.from(panel.attributes);
        for (const attr of attrs) {
          const match = attr.value.match(/(\d+@\w+\.us)/);
          if (match) return match[1];
        }
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Pure DOM fallback: extract phone/name from header.
   * Less reliable but works without Store.
   */
  function getCurrentChatFromDOM() {
    try {
      const headerEl = document.querySelector('#main header span[title]');
      if (!headerEl) return null;

      const title = (headerEl.getAttribute('title') || '').trim();
      if (!title) return null;

      const chatId = getChatIdFromDOM();
      const cleanedPhone = cleanPhoneFromText(title);

      // Determine if it's a group (groups have commas in participant list or no phone)
      const isGroup = chatId ? chatId.endsWith('@g.us') : false;

      return {
        phone: cleanedPhone || (chatId ? cleanPhone(chatId) : null),
        name: cleanedPhone ? null : title, // If title is a phone, name is unknown
        isGroup: isGroup,
        chatId: chatId || null,
        profilePic: null,
      };
    } catch (err) {
      console.warn(TAG, 'getCurrentChatFromDOM error:', err.message);
      return null;
    }
  }

  /**
   * Check if text looks like a phone number and clean it.
   */
  function cleanPhoneFromText(text) {
    const cleaned = (text || '').replace(/[\s\-\(\)\u200e\u200f\u202a\u202c+]/g, '');
    return /^\d{10,15}$/.test(cleaned) ? cleaned : null;
  }

  // ================================================================
  //  UNIFIED GETTER — Store first, DOM fallback
  // ================================================================

  function getCurrentChat() {
    let data = null;

    // Try Store first
    if (storeAvailable) {
      data = getCurrentChatFromStore();
    }

    // Fallback to DOM
    if (!data) {
      data = getCurrentChatFromDOM();
    }

    return data;
  }

  // ================================================================
  //  CHAT CHANGE OBSERVER
  // ================================================================

  /**
   * MutationObserver on #main to detect when user switches conversations.
   * The #main element gets replaced/updated when switching chats.
   */
  function startChatObserver() {
    // Observe changes to the main chat area
    const targetNode = document.getElementById('app') || document.body;

    const observer = new MutationObserver((mutations) => {
      // Look for signals that the chat changed:
      // - #main element added/replaced
      // - header content changed
      let chatMayHaveChanged = false;

      for (const mutation of mutations) {
        // Check added nodes for #main or header changes
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (
              node.id === 'main' ||
              node.querySelector?.('#main') ||
              node.matches?.('#main header *') ||
              node.querySelector?.('[data-testid="conversation-header"]') ||
              node.querySelector?.('[data-testid="conversation-panel-wrapper"]')
            ) {
              chatMayHaveChanged = true;
              break;
            }
          }
        }

        // Attribute changes on header elements
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'title' &&
          mutation.target.closest?.('#main header')
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
      attributeFilter: ['title'],
    });

    console.log(TAG, 'Chat observer started on', targetNode.tagName + '#' + (targetNode.id || ''));
    return observer;
  }

  /**
   * Debounced handler for chat changes.
   * Prevents flooding when DOM updates rapidly during navigation.
   */
  function debouncedChatChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const chat = getCurrentChat();
      if (!chat) return;

      const newId = chat.chatId || chat.phone || chat.name;
      if (newId && newId !== lastChatId) {
        lastChatId = newId;
        console.log(TAG, 'Chat changed →', chat.name || chat.phone, chat.isGroup ? '(group)' : '');
        broadcastChatData(chat);
      }
    }, CHAT_CHANGE_DEBOUNCE);
  }

  // ================================================================
  //  STORE-BASED CHAT OBSERVER (more reliable when available)
  // ================================================================

  /**
   * If Store is available, listen for chat model changes.
   * This is more reliable than DOM observation.
   */
  function startStoreObserver() {
    try {
      const store = window.Q10Store;
      if (!store || !store.Chat) return false;

      // Some versions have an 'on' or 'addListener' method
      if (typeof store.Chat.on === 'function') {
        store.Chat.on('change:active', () => {
          console.log(TAG, 'Store: active chat changed');
          debouncedChatChange();
        });
        console.log(TAG, 'Store-based chat observer started');
        return true;
      }

      // Alternative: poll the active chat via Store
      setInterval(() => {
        const chat = getCurrentChatFromStore();
        if (!chat) return;

        const newId = chat.chatId || chat.phone || chat.name;
        if (newId && newId !== lastChatId) {
          lastChatId = newId;
          console.log(TAG, 'Store poll: chat changed →', chat.name || chat.phone);
          broadcastChatData(chat);
        }
      }, 1000);

      console.log(TAG, 'Store polling observer started (1s interval)');
      return true;
    } catch (err) {
      console.warn(TAG, 'startStoreObserver error:', err.message);
      return false;
    }
  }

  // ================================================================
  //  COMMUNICATION — postMessage
  // ================================================================

  /**
   * Send chat data to the content script via postMessage.
   */
  function broadcastChatData(data) {
    if (!data) return;

    window.postMessage(
      {
        type: 'Q10_CHAT_DATA',
        data: data,
      },
      '*'
    );
  }

  /**
   * Listen for requests from the content script.
   */
  function startMessageListener() {
    window.addEventListener('message', (event) => {
      // Only handle messages from the same window
      if (event.source !== window) return;

      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'Q10_GET_CURRENT_CHAT': {
          const chat = getCurrentChat();
          broadcastChatData(chat);
          break;
        }

        case 'Q10_PING': {
          window.postMessage(
            {
              type: 'Q10_PONG',
              storeAvailable: storeAvailable,
              currentChat: getCurrentChat(),
            },
            '*'
          );
          break;
        }

        case 'Q10_GET_CHAT_BY_ID': {
          if (msg.chatId && storeAvailable && window.Q10Store?.Chat) {
            try {
              const chatModel = window.Q10Store.Chat.get(msg.chatId);
              if (chatModel) {
                broadcastChatData(formatChatData(chatModel, window.Q10Store));
              }
            } catch (_) { /* skip */ }
          }
          break;
        }

        default:
          break;
      }
    });

    console.log(TAG, 'Message listener started');
  }

  // ================================================================
  //  WAIT FOR #main TO EXIST (WhatsApp hasn't loaded chat yet)
  // ================================================================

  function waitForMain() {
    return new Promise((resolve) => {
      const existing = document.getElementById('main');
      if (existing) {
        resolve();
        return;
      }

      const observer = new MutationObserver((_, obs) => {
        if (document.getElementById('main')) {
          obs.disconnect();
          resolve();
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });

      // Timeout after 60 seconds — user may not have opened a chat yet
      setTimeout(() => {
        observer.disconnect();
        resolve(); // resolve anyway, observers will catch it later
      }, 60000);
    });
  }

  // ================================================================
  //  INIT
  // ================================================================

  async function init() {
    console.log(TAG, 'Inject script starting...');

    // 1. Start message listener immediately
    startMessageListener();

    // 2. Wait for Store (loaded by loader.js)
    const storeWait = new Promise((resolve) => {
      // Check immediately
      if (window.Q10Store) {
        resolve(true);
        return;
      }

      // Listen for store ready event from loader.js
      const handler = (event) => {
        if (event.data?.type === 'Q10_STORE_READY') {
          window.removeEventListener('message', handler);
          resolve(true);
        }
        if (event.data?.type === 'Q10_STORE_FALLBACK') {
          window.removeEventListener('message', handler);
          resolve(false);
        }
      };
      window.addEventListener('message', handler);

      // Timeout: proceed with DOM fallback after 30s
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(false);
      }, 30000);
    });

    storeAvailable = await storeWait;

    if (storeAvailable) {
      console.log(TAG, '✅ Store available — using Store-based detection');
    } else {
      console.log(TAG, '⚠️ Store not available — using DOM fallback');
    }

    // 3. Wait for #main (a chat must be open)
    await waitForMain();

    // 4. Start observers
    startChatObserver(); // DOM observer (always)

    if (storeAvailable) {
      startStoreObserver(); // Store observer (when available)
    }

    // 5. Detect initial chat
    setTimeout(() => {
      const initialChat = getCurrentChat();
      if (initialChat) {
        lastChatId = initialChat.chatId || initialChat.phone || initialChat.name;
        console.log(
          TAG,
          'Initial chat:',
          initialChat.name || initialChat.phone,
          initialChat.isGroup ? '(group)' : ''
        );
        broadcastChatData(initialChat);
      } else {
        console.log(TAG, 'No chat open yet — waiting for user to open one.');
      }
    }, 500);

    // 6. Announce ready
    window.postMessage(
      {
        type: 'Q10_INJECT_READY',
        storeAvailable: storeAvailable,
      },
      '*'
    );

    console.log(TAG, '✅ Inject script ready');
  }

  // Kick off
  init().catch((err) => {
    console.error(TAG, 'Init failed:', err);
  });
})();
