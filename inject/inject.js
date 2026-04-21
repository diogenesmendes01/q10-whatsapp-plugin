"use strict";
/* ============================================================
   Q10 CRM — Inject Script (WhatsApp Web)
   Runs in PAGE context to access WhatsApp Web's internal
   Store API for reliable chat/contact detection.

   Communication: window.postMessage ↔ content script

   v1.0 — Store-based detection + DOM fallback
   ============================================================ */
// Global state
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
        if (!store || !store.Chat)
            return null;
        const chatModule = store.Chat;
        let activeChat = null;
        // Method 1: Chat.getActive (some versions)
        if (typeof chatModule.getActive === 'function') {
            activeChat = chatModule.getActive();
        }
        // Method 2: Look for Chat with active=true flag
        if (!activeChat && typeof chatModule.getModelsArray === 'function') {
            const chats = chatModule.getModelsArray();
            activeChat = chats.find((c) => c.active || c.isActive);
        }
        // Method 3: Check the currently visible chat via the DOM chatId,
        // then look it up in Store for rich data
        if (!activeChat) {
            const chatId = getChatIdFromDOM();
            if (chatId && typeof chatModule.get === 'function') {
                activeChat = chatModule.get(chatId);
            }
        }
        if (!activeChat)
            return null;
        return formatChatData(activeChat, store);
    }
    catch (err) {
        console.warn(TAG, 'getCurrentChatFromStore error:', err.message);
        return null;
    }
}
/**
 * Format a Store chat model into the Q10 data shape.
 */
function formatChatData(chat, store) {
    try {
        const chatIdRaw = chat.id;
        const id = typeof chatIdRaw === 'object' && chatIdRaw !== null
            ? chatIdRaw._serialized ?? String(chatIdRaw)
            : String(chatIdRaw ?? '');
        const isGroup = id.endsWith('@g.us');
        const phone = isGroup ? null : cleanPhone(id);
        // Get contact name (multiple fallbacks)
        let name = null;
        if (typeof chat.name === 'string' && chat.name) {
            name = chat.name;
        }
        else if (typeof chat.formattedTitle === 'string' && chat.formattedTitle) {
            name = chat.formattedTitle;
        }
        else if (chat.contact) {
            const contact = chat.contact;
            name = contact.pushname
                || contact.formattedName
                || contact.name
                || contact.shortName
                || null;
        }
        // Try Store.Contact for better name data
        if (!name && store.Contact && !isGroup) {
            try {
                const contactGetter = store.Contact;
                if (typeof contactGetter.get === 'function') {
                    const contact = contactGetter.get(chat.id);
                    if (contact) {
                        name = contact.pushname
                            || contact.formattedName
                            || contact.name
                            || contact.shortName
                            || null;
                    }
                }
            }
            catch (_) { /* skip */ }
        }
        // Profile pic (if available in model)
        let profilePic = null;
        try {
            const contact = chat.contact;
            const profilePicThumb = contact?.profilePicThumb;
            profilePic = profilePicThumb?.eurl ?? null;
        }
        catch (_) { /* skip */ }
        return {
            phone,
            name,
            isGroup,
            chatId: id,
            profilePic,
        };
    }
    catch (err) {
        console.warn(TAG, 'formatChatData error:', err.message);
        return null;
    }
}
/**
 * Clean phone from chatId format: "5519988145438@c.us" → "5519988145438"
 */
function cleanPhone(chatId) {
    if (!chatId)
        return null;
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
            if (match)
                return match[1];
        }
        // conversation-panel-wrapper sometimes has data attributes
        const panel = document.querySelector('[data-testid="conversation-panel-wrapper"]');
        if (panel) {
            const attrs = Array.from(panel.attributes);
            for (const attr of attrs) {
                const match = attr.value.match(/(\d+@\w+\.us)/);
                if (match)
                    return match[1];
            }
        }
        return null;
    }
    catch (_) {
        return null;
    }
}
/**
 * Pure DOM fallback: extract phone/name from header.
 * Less reliable but works without Store.
 */
function getCurrentChatFromDOM() {
    try {
        const headerEl = document.querySelector('#main header span');
        if (!headerEl)
            return null;
        const title = (headerEl.textContent || '').trim();
        if (!title)
            return null;
        const chatId = getChatIdFromDOM();
        const cleanedPhone = cleanPhoneFromText(title);
        const isGroup = chatId ? chatId.endsWith('@g.us') : false;
        return {
            phone: cleanedPhone || (chatId ? cleanPhone(chatId) : null),
            name: cleanedPhone ? null : title,
            isGroup,
            chatId: chatId || null,
            profilePic: null,
        };
    }
    catch (err) {
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
    if (storeAvailable) {
        const data = getCurrentChatFromStore();
        if (data)
            return data;
    }
    return getCurrentChatFromDOM();
}
// ================================================================
//  CHAT CHANGE OBSERVER
// ================================================================
/**
 * MutationObserver on #main to detect when user switches conversations.
 * The #main element gets replaced/updated when switching chats.
 */
function startChatObserver() {
    const targetNode = document.getElementById('app') || document.body;
    const observer = new MutationObserver((mutations) => {
        let chatMayHaveChanged = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of Array.from(mutation.addedNodes)) {
                    if (node.nodeType !== 1)
                        continue;
                    const el = node;
                    if (el.id === 'main' ||
                        el.querySelector?.('#main') ||
                        el.matches?.('#main header *') ||
                        el.querySelector?.('[data-testid="conversation-header"]') ||
                        el.querySelector?.('[data-testid="conversation-panel-wrapper"]')) {
                        chatMayHaveChanged = true;
                        break;
                    }
                }
            }
            if (mutation.type === 'attributes' &&
                mutation.attributeName === 'title' &&
                mutation.target.closest?.('#main header')) {
                chatMayHaveChanged = true;
            }
            if (chatMayHaveChanged)
                break;
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
    console.log(TAG, 'Chat observer started on', targetNode.tagName + '#' + targetNode.id);
    return observer;
}
/**
 * Debounced handler for chat changes.
 * Prevents flooding when DOM updates rapidly during navigation.
 */
function debouncedChatChange() {
    if (debounceTimer !== null)
        clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const chat = getCurrentChat();
        if (!chat)
            return;
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
        if (!store || !store.Chat)
            return false;
        const chatModule = store.Chat;
        // Some versions have an 'on' or 'addListener' method
        if (typeof chatModule.on === 'function') {
            chatModule.on('change:active', () => {
                console.log(TAG, 'Store: active chat changed');
                debouncedChatChange();
            });
            console.log(TAG, 'Store-based chat observer started');
            return true;
        }
        // Alternative: poll the active chat via Store
        setInterval(() => {
            const chat = getCurrentChatFromStore();
            if (!chat)
                return;
            const newId = chat.chatId || chat.phone || chat.name;
            if (newId && newId !== lastChatId) {
                lastChatId = newId;
                console.log(TAG, 'Store poll: chat changed →', chat.name || chat.phone);
                broadcastChatData(chat);
            }
        }, 1000);
        console.log(TAG, 'Store polling observer started (1s interval)');
        return true;
    }
    catch (err) {
        console.warn(TAG, 'startStoreObserver error:', err.message);
        return false;
    }
}
// ================================================================
//  COMMUNICATION — postMessage
// ================================================================
const TAG = '[Q10 Inject]';
const CHAT_CHANGE_DEBOUNCE = 300; // ms
/**
 * Send chat data to the content script via postMessage.
 */
function broadcastChatData(data) {
    if (!data)
        return;
    window.postMessage({ type: 'Q10_CHAT_DATA', data }, '*');
}
/**
 * Listen for requests from the content script.
 */
function startMessageListener() {
    window.addEventListener('message', (event) => {
        if (event.source !== window)
            return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object')
            return;
        switch (msg.type) {
            case 'Q10_GET_CURRENT_CHAT': {
                const chat = getCurrentChat();
                if (chat)
                    broadcastChatData(chat);
                break;
            }
            case 'Q10_PING': {
                window.postMessage({
                    type: 'Q10_PONG',
                    storeAvailable,
                    currentChat: getCurrentChat(),
                }, '*');
                break;
            }
            case 'Q10_GET_CHAT_BY_ID': {
                if (msg.chatId && storeAvailable) {
                    const store = window.Q10Store;
                    if (store?.Chat) {
                        try {
                            const chatModule = store.Chat;
                            const chatModel = chatModule.get(msg.chatId);
                            if (chatModel) {
                                const formatted = formatChatData(chatModel, store);
                                if (formatted)
                                    broadcastChatData(formatted);
                            }
                        }
                        catch (_) { /* skip */ }
                    }
                }
                break;
            }
        }
    });
    console.log(TAG, 'Message listener started');
}
// ================================================================
//  WAIT FOR #main TO EXIST (WhatsApp hasn't loaded chat yet)
// ================================================================
function waitForMain() {
    return new Promise((resolve) => {
        if (document.getElementById('main')) {
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
            resolve();
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
    const storeAvailablePromise = new Promise((resolve) => {
        if (window.Q10Store) {
            resolve(true);
            return;
        }
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
    storeAvailable = await storeAvailablePromise;
    if (storeAvailable) {
        console.log(TAG, '✅ Store available — using Store-based detection');
    }
    else {
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
            console.log(TAG, 'Initial chat:', initialChat.name || initialChat.phone, initialChat.isGroup ? '(group)' : '');
            broadcastChatData(initialChat);
        }
        else {
            console.log(TAG, 'No chat open yet — waiting for user to open one.');
        }
    }, 500);
    // 6. Announce ready
    window.postMessage({ type: 'Q10_INJECT_READY', storeAvailable }, '*');
    console.log(TAG, '✅ Inject script ready');
}
// Kick off
init().catch((err) => {
    console.error(TAG, 'Init failed:', err);
});
// Avoid double-init
window.__q10InjectReady = true;
