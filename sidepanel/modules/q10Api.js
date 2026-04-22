/* ============================================================
   Q10 CRM — Q10 API Module
   Wraps chrome.runtime.sendMessage for service-worker communication.
   ============================================================ */

export function sendMsg(action, extra = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...extra }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp) return reject(new Error('No response'));
      if (!resp.ok) return reject(new Error(resp.error || 'Unknown error'));
      resolve(resp.data);
    });
  });
}