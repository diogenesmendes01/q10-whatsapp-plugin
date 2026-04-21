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

  // ---------------- Asesor dropdown ----------------
  const asesorSelect = document.getElementById('asesor-select');
  const asesorDot = document.getElementById('asesor-dot');
  const asesorLabel = document.getElementById('asesor-label');
  const btnSaveAsesor = document.getElementById('btn-save-asesor');
  const btnRefreshAsesores = document.getElementById('btn-refresh-asesores');
  let savedAsesorId = null;

  function updateAsesorStatus(configured, name) {
    if (configured) {
      asesorDot.className = 'status-dot green';
      asesorLabel.textContent = name ? `Configurado: ${name}` : 'Configurado ✓';
    } else {
      asesorDot.className = 'status-dot red';
      asesorLabel.textContent = 'Não configurado';
    }
  }

  function fullAsesorName(a) {
    return [a.Primer_nombre, a.Segundo_nombre, a.Primer_apellido, a.Segundo_apellido]
      .filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(' ');
  }

  // Escape API-sourced strings before interpolating into innerHTML templates.
  // Nomes de administrativos/emails no Q10 são texto livre — sem escape,
  // caracteres como < " ' podem quebrar o DOM ou abrir XSS.
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function populateAsesores(list, selectedId) {
    if (!Array.isArray(list) || list.length === 0) {
      asesorSelect.innerHTML = '<option value="">— Nenhum administrativo encontrado —</option>';
      asesorSelect.disabled = true;
      btnSaveAsesor.disabled = true;
      return;
    }
    const sorted = list.slice().sort((a, b) => fullAsesorName(a).localeCompare(fullAsesorName(b)));
    const opts = ['<option value="">— Seleccionar asesor —</option>'].concat(
      sorted.map(a => {
        const name = fullAsesorName(a) || `Asesor ${a.Numero_identificacion}`;
        const sel = a.Numero_identificacion === selectedId ? 'selected' : '';
        return `<option value="${escHtml(a.Numero_identificacion)}" data-name="${escHtml(name)}" ${sel}>${escHtml(name)} (${escHtml(a.Numero_identificacion)})</option>`;
      })
    );
    asesorSelect.innerHTML = opts.join('');
    asesorSelect.disabled = false;
    btnSaveAsesor.disabled = false;
    if (selectedId) {
      const match = sorted.find(a => a.Numero_identificacion === selectedId);
      if (match) updateAsesorStatus(true, fullAsesorName(match));
    }
  }

  function loadAsesoresList() {
    chrome.storage.sync.get(['q10ApiKey', 'q10AsesorId'], (result) => {
      savedAsesorId = result.q10AsesorId || null;
      if (!result.q10ApiKey) {
        asesorSelect.innerHTML = '<option value="">— Configure a API key primeiro —</option>';
        asesorSelect.disabled = true;
        btnSaveAsesor.disabled = true;
        updateAsesorStatus(false);
        return;
      }
      asesorSelect.innerHTML = '<option value="">Carregando administrativos...</option>';
      asesorSelect.disabled = true;
      chrome.runtime.sendMessage({ action: 'fetchAdministrativos' }, (resp) => {
        if (!resp || !resp.ok) {
          const msg = (resp && resp.error) || 'Erro desconhecido';
          asesorSelect.innerHTML = `<option value="">— Erro: ${escHtml(msg)} —</option>`;
          asesorSelect.disabled = true;
          btnSaveAsesor.disabled = true;
          return;
        }
        populateAsesores(resp.data, savedAsesorId);
      });
    });
  }

  // Load on page ready
  loadAsesoresList();

  btnSaveAsesor.addEventListener('click', () => {
    const asesorId = asesorSelect.value;
    if (!asesorId) {
      showAlert('error', 'Selecione um asesor da lista');
      return;
    }
    const selectedOption = asesorSelect.options[asesorSelect.selectedIndex];
    const name = selectedOption.getAttribute('data-name') || '';
    btnSaveAsesor.disabled = true;
    btnSaveAsesor.textContent = 'Salvando...';
    chrome.storage.sync.set({ q10AsesorId: asesorId }, () => {
      if (chrome.runtime.lastError) {
        showAlert('error', 'Erro ao salvar: ' + chrome.runtime.lastError.message);
      } else {
        showAlert('success', `Asesor "${name}" salvo com sucesso!`);
        savedAsesorId = asesorId;
        updateAsesorStatus(true, name);
      }
      btnSaveAsesor.disabled = false;
      btnSaveAsesor.textContent = '💾 Salvar Asesor';
    });
  });

  btnRefreshAsesores.addEventListener('click', () => {
    btnRefreshAsesores.disabled = true;
    // Clear the SW's apiGet cache so we hit the network fresh
    chrome.runtime.sendMessage({ action: 'clearCache' }, () => {
      loadAsesoresList();
      setTimeout(() => { btnRefreshAsesores.disabled = false; }, 800);
    });
  });

  // Load API key status (asesor dropdown is handled separately above)
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
        // Auto-load asesores list now that we have an API key
        chrome.runtime.sendMessage({ action: 'clearCache' }, () => loadAsesoresList());
      }
      btnSave.disabled = false;
      btnSave.textContent = '💾 Salvar';
    });
  });

  // Clear
  btnClear.addEventListener('click', () => {
    if (!confirm('Tem certeza que deseja remover a API key? O asesor configurado também será limpo.')) return;

    // Remove q10AsesorId junto: se trocar de tenant/chave, um asesor salvo de outro
    // tenant seria injetado em oportunidades/atividades pelo service worker.
    chrome.storage.sync.remove(['q10ApiKey', 'q10AsesorId'], () => {
      input.value = '';
      savedAsesorId = null;
      updateStatus(false);
      updateAsesorStatus(false);
      loadAsesoresList();
      showAlert('success', 'API key e asesor removidos');
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
