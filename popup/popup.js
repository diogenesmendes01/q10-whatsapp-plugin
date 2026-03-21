document.addEventListener('DOMContentLoaded', () => {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const hint = document.getElementById('status-hint');

  // Check API key status
  chrome.storage.sync.get(['q10ApiKey'], (result) => {
    if (result.q10ApiKey) {
      dot.className = 'status-dot green';
      text.textContent = 'API Key configurada ✓';
      hint.textContent = 'Abra o WhatsApp Web para ver dados do Q10';
    } else {
      dot.className = 'status-dot red';
      text.textContent = 'API Key não configurada';
      hint.textContent = 'Configure sua chave nas configurações';
    }
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('btn-whatsapp').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://web.whatsapp.com' });
  });
});
