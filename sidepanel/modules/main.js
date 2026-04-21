/* ============================================================
   Q10 CRM — Side Panel
   Module: Main Orchestration & Init
   v3.0
   ============================================================ */

(function () {
  'use strict';

  // Load all modules in dependency order
  // 1. Icons (no dependencies)
  // 2. State (no dependencies)
  // 3. DOM utilities (depends on ICONS)
  // 4. API calls (no dependencies)
  // 5. Handlers (depends on api, dom, state)
  // 6. Renderer (depends on api, dom, state, handlers)
  // 7. Main (orchestrates everything)

  // Module registry — populated by each module file
  window.Q10SidePanel = window.Q10SidePanel || {};

  // ================================================================
  //  INIT — Phone listener + startup
  // ================================================================
  function init() {
    chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
      if (!resp || !resp.ok || !resp.data?.configured) {
        dom.renderNoApiKey();
        return;
      }

      chrome.storage.session.get(['currentPhone', 'currentContactName'], (result) => {
        if (result.currentPhone) {
          handlers.searchPhone(result.currentPhone);
        } else if (result.currentContactName) {
          dom.renderLoading('Buscando: ' + result.currentContactName + '...');
          chrome.runtime.sendMessage({ action: 'searchName', name: result.currentContactName }, (searchResp) => {
            if (searchResp && searchResp.ok && searchResp.data.type !== 'unknown') {
              state.setCurrentResult(searchResp.data);
              if (searchResp.data.type === 'estudiante') renderer.renderEstudiante(searchResp.data);
              else if (searchResp.data.type === 'contacto') renderer.renderContacto(searchResp.data);
              else if (searchResp.data.type === 'oportunidad') renderer.renderOportunidad(searchResp.data);
            } else {
              renderer.renderUnknown(result.currentContactName);
            }
          });
        } else {
          renderer.renderNoConversation();
        }
      });
    });

    console.log('[Q10 CRM] Side panel loaded (v3.0)');
  }

  // Listen for phone changes from content script
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session') return;
    const ws = state.getWizardState();
    if (ws) return; // Don't interrupt wizard

    if (changes.currentPhone) {
      const newPhone = changes.currentPhone.newValue;
      if (changes.currentContactName?.newValue) state.setCurrentContactName(changes.currentContactName.newValue);
      if (newPhone && newPhone !== state.getCurrentPhone()) {
        chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
          if (resp && resp.ok && resp.data?.configured) {
            handlers.searchPhone(newPhone);
          } else {
            renderer.renderNoApiKey();
          }
        });
      } else if (!newPhone && !changes.currentContactName) {
        state.setCurrentPhone(null);
        renderer.renderNoConversation();
      }
    }

    if (changes.currentContactName) {
      const newName = changes.currentContactName.newValue;
      const phoneFromChange = changes.currentPhone?.newValue || null;
      if (phoneFromChange) state.setCurrentPhone(phoneFromChange);
      state.setCurrentContactName(newName);
      if (newName) {
        chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
          if (resp && resp.ok && resp.data?.configured) {
            if (state.getCurrentPhone()) {
              renderer.renderLoading('Buscando: ' + state.getCurrentPhone() + '...');
              handlers.searchPhone(state.getCurrentPhone());
              return;
            }
            renderer.renderLoading('Buscando: ' + newName + '...');
            chrome.runtime.sendMessage({ action: 'searchName', name: newName }, (searchResp) => {
              if (searchResp && searchResp.ok) {
                state.setCurrentResult(searchResp.data);
                state.setCurrentPhone(searchResp.data?.phone || state.getCurrentPhone() || null);
                if (searchResp.data.type === 'unknown') {
                  renderer.renderUnknown(newName);
                } else if (searchResp.data.type === 'estudiante') {
                  renderer.renderEstudiante(searchResp.data);
                } else if (searchResp.data.type === 'contacto') {
                  renderer.renderContacto(searchResp.data);
                } else if (searchResp.data.type === 'oportunidad') {
                  renderer.renderOportunidad(searchResp.data);
                }
              } else {
                renderer.renderUnknown(newName);
              }
            });
          }
        });
      } else if (!changes.currentPhone) {
        renderer.renderNoConversation();
      }
    }
  });

  // Expose init globally so sidepanel.js can call it
  window.Q10SidePanel.init = init;
})();
