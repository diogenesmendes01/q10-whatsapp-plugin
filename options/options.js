document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('api-key-input');
  const btnSave = document.getElementById('btn-save');
  const btnClear = document.getElementById('btn-clear');
  const btnTest = document.getElementById('btn-test');
  const alertSuccess = document.getElementById('alert-success');
  const alertError = document.getElementById('alert-error');
  const keyDot = document.getElementById('key-dot');
  const keyLabel = document.getElementById('key-label');
  const testResult = document.getElementById('test-result');

  function showAlert(type, msg) {
    alertSuccess.style.display = 'none';
    alertError.style.display = 'none';
    if (type === 'success') {
      alertSuccess.textContent = '✅ ' + msg;
      alertSuccess.style.display = 'block';
    } else {
      alertError.textContent = '❌ ' + msg;
      alertError.style.display = 'block';
    }
    setTimeout(() => {
      alertSuccess.style.display = 'none';
      alertError.style.display = 'none';
    }, 5000);
  }

  function updateStatus(configured) {
    if (configured) {
      keyDot.className = 'status-dot green';
      keyLabel.textContent = 'Configurada ✓';
    } else {
      keyDot.className = 'status-dot red';
      keyLabel.textContent = 'Não configurada';
    }
  }

  // Load current key
  chrome.storage.sync.get(['q10ApiKey'], (result) => {
    if (result.q10ApiKey) {
      input.value = result.q10ApiKey;
      updateStatus(true);
    }
  });

  // Save
  btnSave.addEventListener('click', () => {
    const key = input.value.trim();
    if (!key) {
      showAlert('error', 'Insira uma API key válida');
      return;
    }

    btnSave.disabled = true;
    btnSave.textContent = 'Salvando...';

    chrome.storage.sync.set({ q10ApiKey: key }, () => {
      if (chrome.runtime.lastError) {
        showAlert('error', 'Erro ao salvar: ' + chrome.runtime.lastError.message);
      } else {
        showAlert('success', 'Configuração salva com sucesso!');
        updateStatus(true);
      }
      btnSave.disabled = false;
      btnSave.textContent = '💾 Salvar';
    });
  });

  // Clear
  btnClear.addEventListener('click', () => {
    if (!confirm('Tem certeza que deseja remover a API key?')) return;

    chrome.storage.sync.remove(['q10ApiKey'], () => {
      input.value = '';
      updateStatus(false);
      showAlert('success', 'API key removida');
    });
  });

  // Test connection
  btnTest.addEventListener('click', () => {
    const key = input.value.trim();
    if (!key) {
      showAlert('error', 'Insira uma API key antes de testar');
      return;
    }

    btnTest.disabled = true;
    btnTest.textContent = '⏳ Testando...';
    testResult.style.display = 'none';

    fetch('https://api.q10.com/v1/contactos?Limit=1&Offset=1', {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/json'
      }
    })
    .then(resp => {
      testResult.style.display = 'block';
      if (resp.ok) {
        testResult.innerHTML = '<span style="color:#065F46">✅ <strong>Conexão OK!</strong> A API key é válida e a API está acessível.</span>';
      } else if (resp.status === 401 || resp.status === 403) {
        testResult.innerHTML = '<span style="color:#991B1B">❌ <strong>API key inválida.</strong> Verifique a chave e tente novamente.</span>';
      } else {
        testResult.innerHTML = `<span style="color:#92400E">⚠️ <strong>Resposta inesperada (${resp.status}).</strong> A API pode estar temporariamente indisponível.</span>`;
      }
    })
    .catch(err => {
      testResult.style.display = 'block';
      testResult.innerHTML = `<span style="color:#991B1B">❌ <strong>Erro de conexão:</strong> ${err.message}</span>`;
    })
    .finally(() => {
      btnTest.disabled = false;
      btnTest.textContent = '🔌 Testar Conexão';
    });
  });
});
