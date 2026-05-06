/* ============================================================
   Q10 CRM — Side Panel Script (v4.0)
   Orchestration layer: imports modules and wires up event listeners.
   All business logic lives in sidepanel/modules/.
   ============================================================ */

(function () {
  'use strict';

  // ================================================================
  //  MODULE IMPORTS
  // ================================================================
  import('./modules/helpers.js').then(m => {
    window._helpers = m;
  });

  import('./modules/state.js').then(m => {
    Object.keys(m).forEach(k => window['_' + k] = m[k]);
  });

  import('./modules/q10Api.js').then(m => {
    window._q10Api = m;
  });

  import('./modules/renderer.js').then(m => {
    Object.keys(m).forEach(k => window['_' + k] = m[k]);
  });

  import('./modules/handlers.js').then(m => {
    Object.keys(m).forEach(k => window['_' + k] = m[k]);
  });

  import('./modules/wizard.js').then(m => {
    Object.keys(m).forEach(k => window['_' + k] = m[k]);
  });

  import('./modules/batchLeads.js').then(m => {
    window._renderBatchLeads = m.renderBatchLeads;
  });

  // ================================================================
  //  BRIDGE HELPERS — expose module functions to DOM inline handlers
  //  These replace the old inline <script> snippets that called
  //  renderEstudiante(currentResult), etc. from wizard complete.
  // ================================================================

  // ================================================================
  //  STORAGE LISTENER
  // ================================================================
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session') return;
    // Access module state via global aliases
    const _wizardState = window._wizardState;
    if (_wizardState) return; // Don't interrupt wizard

    // state.js exports `let` bindings that only update via their setters.
    // Plain `window._currentContactName = X` mutates a window prop and leaves
    // the imported binding inside handlers.js still pointing at the old value
    // (null), so the WhatsApp-detected name never reached renderResult or the
    // Crear Oportunidad / wizard prefill paths. Always go through the setters.
    const setPhone = window._setCurrentPhone || (v => { window._currentPhone = v; });
    const setName = window._setCurrentContactName || (v => { window._currentContactName = v; });

    if (changes.currentPhone) {
      const newPhone = changes.currentPhone.newValue;
      if (changes.currentContactName?.newValue) {
        setName(changes.currentContactName.newValue);
      }
      if (newPhone && newPhone !== window._currentPhone) {
        chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
          if (resp && resp.ok && resp.data?.configured) {
            window._searchPhone(newPhone);
          } else {
            window._renderNoApiKey();
          }
        });
      } else if (!newPhone && !changes.currentContactName) {
        setPhone(null);
        window._renderNoConversation();
      }
    }

    if (changes.currentContactName) {
      const newName = changes.currentContactName.newValue;
      const phoneFromChange = changes.currentPhone?.newValue || null;
      if (phoneFromChange) setPhone(phoneFromChange);
      setName(newName);
      if (newName) {
        chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
          if (resp && resp.ok && resp.data?.configured) {
            if (window._currentPhone) {
              window._searchPhone(window._currentPhone);
              return;
            }
            window._searchName(newName);
          }
        });
      } else if (!changes.currentPhone) {
        window._renderNoConversation();
      }
    }
  });

  // ================================================================
  //  INIT
  // ================================================================
  function init() {
    chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
      if (!resp || !resp.ok || !resp.data?.configured) {
        window._renderNoApiKey();
        return;
      }

      chrome.storage.session.get(['currentPhone', 'currentContactName'], (result) => {
        if (result.currentPhone) {
          window._searchPhone(result.currentPhone);
        } else if (result.currentContactName) {
          window._searchName(result.currentContactName, result.currentPhone || null);
        } else {
          window._renderNoConversation();
        }
      });
    });

    console.log('[Q10 CRM] Side panel loaded (v4.0 — modular)');
  }

  // Wait for modules to load before calling init
  // Use a simple polling approach since ES modules are synchronous once loaded
  function waitForModules(callback) {
    const check = () => {
      if (window._searchPhone && window._renderNoConversation && window._renderLoading) {
        callback();
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  }

  waitForModules(() => {
    init();

    // Batch leads button — available regardless of current view
    document.getElementById('btn-batch-leads')?.addEventListener('click', () => {
      if (window._renderBatchLeads) window._renderBatchLeads();
    });
  });

})();