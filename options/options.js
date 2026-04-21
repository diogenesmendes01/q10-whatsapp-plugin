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

  // Load current key and asesor ID
  chrome.storage.sync.get(['q10ApiKey', 'q10AsesorId'], (result) => {
    if (result.q10ApiKey) {
      input.value = result.q10ApiKey;
      updateStatus(true);
    }
    const asesorInput = document.getElementById('asesor-id-input');
    if (asesorInput && result.q10AsesorId) {
      asesorInput.value = result.q10AsesorId;
    }
  });

  // Save asesor ID (Numero_identificacion_asesor) — required for /oportunidades and /actividades
  const btnSaveAsesor = document.getElementById('btn-save-asesor');
  if (btnSaveAsesor) {
    btnSaveAsesor.addEventListener('click', () => {
      const asesorInput = document.getElementById('asesor-id-input');
      const asesorId = (asesorInput.value || '').trim();
      if (!asesorId) {
        showAlert('error', 'Informe a identificación del asesor');
        return;
      }
      btnSaveAsesor.disabled = true;
      btnSaveAsesor.textContent = 'Salvando...';
      chrome.storage.sync.set({ q10AsesorId: asesorId }, () => {
        if (chrome.runtime.lastError) {
          showAlert('error', 'Erro ao salvar: ' + chrome.runtime.lastError.message);
        } else {
          showAlert('success', 'Asesor salvo com sucesso!');
        }
        btnSaveAsesor.disabled = false;
        btnSaveAsesor.textContent = '💾 Salvar Asesor';
      });
    });
  }

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

    fetch('https://geniusidiomas.com/api/q10/contacts?Limit=1&Offset=1', {
      method: 'GET',
      headers: {
        'X-Q10-Key': key,
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
