/* ============================================================
   Q10 CRM — Store Loader (WhatsApp Web)
   Resolves the WhatsApp Store via Q10StoreAdapter abstraction.

   This loader:
   1. Loads store-adapter.js into the page context
   2. Calls Q10StoreAdapter.resolveStore() (auto-runs on adapter load)
   3. Handles the Q10_ADAPTER_READY / Q10_ADAPTER_UNAVAILABLE events

   Runs in PAGE context (injected via <script> tag).
   ============================================================ */

(function () {
  'use strict';

  var TAG = '[Q10 Loader]';
  var ADAPTER_INIT_TIMEOUT = 30000; // ms

  // Avoid double-init
  if (window.__q10LoaderRunning) {
    console.log(TAG, 'Loader already running, skipping.');
    return;
  }
  window.__q10LoaderRunning = true;

  // ──────────────────────────────────────────────────────────────
  //  Load store-adapter.js (sets window.Q10StoreAdapter + auto-bootstraps)
  // ──────────────────────────────────────────────────────────────
  function loadAdapter() {
    return new Promise(function(resolve) {
      if (window.Q10StoreAdapter) {
        resolve();
        return;
      }

      var script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject/store-adapter.js');
      script.type = 'text/javascript';
      script.onload = function() {
        console.log(TAG, 'store-adapter.js loaded');
        resolve();
      };
      script.onerror = function() {
        console.error(TAG, 'Failed to load store-adapter.js');
        resolve();
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  // ──────────────────────────────────────────────────────────────
  //  Wait for adapter to signal readiness / unavailability
  // ──────────────────────────────────────────────────────────────
  function waitForAdapterSignal() {
    return new Promise(function(resolve) {
      // Check if already resolved
      if (window.Q10StoreAdapter && window.Q10StoreAdapter.isAvailable()) {
        resolve(true);
        return;
      }
      if (window.Q10StoreAdapter && window.Q10StoreAdapter.isBroken()) {
        resolve(false);
        return;
      }

      var handler = function(event) {
        if (event.source !== window) return;
        var type = event.data && event.data.type;
        if (type === 'Q10_ADAPTER_READY') {
          window.removeEventListener('message', handler);
          window.removeEventListener('message', fallbackHandler);
          clearTimeout(timeoutId);
          resolve(true);
        }
        if (type === 'Q10_ADAPTER_UNAVAILABLE' || type === 'Q10_STORE_FALLBACK') {
          window.removeEventListener('message', handler);
          window.removeEventListener('message', fallbackHandler);
          clearTimeout(timeoutId);
          resolve(false);
        }
      };

      var fallbackHandler = function(event) {
        if (event.source !== window) return;
        if (event.data && event.data.type === 'Q10_STORE_FALLBACK') {
          window.removeEventListener('message', handler);
          window.removeEventListener('message', fallbackHandler);
          clearTimeout(timeoutId);
          resolve(false);
        }
      };

      window.addEventListener('message', handler);
      window.addEventListener('message', fallbackHandler);

      var timeoutId = setTimeout(function() {
        window.removeEventListener('message', handler);
        window.removeEventListener('message', fallbackHandler);
        resolve(false);
      }, ADAPTER_INIT_TIMEOUT);
    });
  }

  // ──────────────────────────────────────────────────────────────
  //  Init
  // ──────────────────────────────────────────────────────────────
  async function init() {
    console.log(TAG, 'Store loader starting...');

    await loadAdapter();
    var available = await waitForAdapterSignal();

    if (available) {
      console.log(TAG, 'Q10StoreAdapter ready.');
    } else {
      console.warn(TAG, 'Q10StoreAdapter unavailable — DOM fallback will be used.');
    }
  }

  init();
})();
