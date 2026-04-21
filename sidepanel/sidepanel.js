/* ============================================================
   Q10 CRM — Side Panel Script
   Modular entry point. Loads all focused modules and
   delegates to the main init function.
   v3.0
   ============================================================ */

(function () {
  'use strict';

  var base = chrome.runtime.getURL('sidepanel/modules/');

  function loadScript(src, onload) {
    var s = document.createElement('script');
    s.src = base + src;
    if (onload) s.onload = onload;
    (document.head || document.documentElement).appendChild(s);
    return s;
  }

  loadScript('icons.js', function () {
    loadScript('state.js', function () {
      loadScript('dom.js', function () {
        loadScript('api.js', function () {
          loadScript('handlers.js', function () {
            loadScript('renderer.js', function () {
              loadScript('main.js', function () {
                if (window.Q10SidePanel && typeof window.Q10SidePanel.init === 'function') {
                  window.Q10SidePanel.init();
                }
              });
            });
          });
        });
      });
    });
  });

}());
