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

    if (changes.currentPhone) {
      const newPhone = changes.currentPhone.newValue;
      if (changes.currentContactName?.newValue) {
        window._currentContactName = changes.currentContactName.newValue;
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
        window._currentPhone = null;
        window._renderNoConversation();
      }
    }

    if (changes.currentContactName) {
      const newName = changes.currentContactName.newValue;
      const phoneFromChange = changes.currentPhone?.newValue || null;
      if (phoneFromChange) window._currentPhone = phoneFromChange;
      window._currentContactName = newName;
      if (newName) {
        chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
          if (resp && resp.ok && resp.data?.configured) {
            if (window._currentPhone) {
              window._renderLoading('Buscando: ' + window._currentPhone + '...');
              window._searchPhone(window._currentPhone);
              return;
            }
            window._renderLoading('Buscando: ' + newName + '...');
            chrome.runtime.sendMessage({ action: 'searchName', name: newName }, (searchResp) => {
              if (searchResp && searchResp.ok) {
                window._currentResult = searchResp.data;
                window._currentPhone = searchResp.data?.phone || window._currentPhone || null;
                if (searchResp.data.type === 'unknown') {
                  window._renderUnknown(newName);
                } else if (searchResp.data.type === 'estudiante') {
                  window._renderEstudiante(searchResp.data);
                } else if (searchResp.data.type === 'contacto') {
                  window._renderContacto(searchResp.data);
                } else if (searchResp.data.type === 'oportunidad') {
                  window._renderOportunidad(searchResp.data);
                }
              } else {
                window._renderUnknown(newName);
              }
            });
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
          window._renderLoading('Buscando: ' + result.currentContactName + '...');
          chrome.runtime.sendMessage({ action: 'searchName', name: result.currentContactName }, (searchResp) => {
            if (searchResp && searchResp.ok && searchResp.data.type !== 'unknown') {
              window._currentResult = searchResp.data;
              if (searchResp.data.type === 'estudiante') window._renderEstudiante(searchResp.data);
              else if (searchResp.data.type === 'contacto') window._renderContacto(searchResp.data);
              else if (searchResp.data.type === 'oportunidad') window._renderOportunidad(searchResp.data);
            } else {
              window._renderUnknown(result.currentContactName);
            }
          });
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