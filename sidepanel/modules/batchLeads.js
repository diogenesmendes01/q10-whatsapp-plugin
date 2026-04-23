/* ============================================================
   Q10 CRM — Batch Leads Module
   Extracts contacts from WhatsApp Web chat list → CSV download
   and imports a CSV file → Q10 /contactos (batch)
   ============================================================ */

// ================================================================
//  RENDER
// ================================================================
export function renderBatchLeads() {
  const body = document.getElementById('q10-body');
  const actions = document.getElementById('q10-actions');
  actions.style.display = 'none';
  actions.innerHTML = '';

  body.innerHTML = `
    <div style="padding:16px;display:flex;flex-direction:column;gap:16px;">

      <!-- SECTION 1: Extract -->
      <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <div style="font-weight:600;font-size:13px;color:#0369A1;margin-bottom:10px;">
          1. Extrair contatos do WhatsApp Web
        </div>

        <div style="font-size:12px;color:#6B7280;margin-bottom:10px;">
          Período das conversas:
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;" id="bl-period-btns">
          ${['3m','6m','1a','Tudo'].map((v, i) => `
            <button class="bl-period${i===0?' bl-period-active':''}" data-period="${v}"
              style="padding:5px 10px;border-radius:20px;border:1.5px solid ${i===0?'#0EA5E9':'#D1D5DB'};
                     background:${i===0?'#EFF6FF':'#fff'};color:${i===0?'#0369A1':'#374151'};
                     font-size:12px;font-weight:500;cursor:pointer;">
              ${v}
            </button>`).join('')}
        </div>

        <button id="bl-extract-btn"
          style="width:100%;padding:9px;background:#0EA5E9;color:#fff;border:none;border-radius:8px;
                 font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
          <span>&#9654;</span> Extrair Contatos
        </button>

        <div id="bl-progress" style="display:none;margin-top:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;color:#374151;" id="bl-progress-label">Buscando...</span>
            <button id="bl-stop-btn"
              style="font-size:11px;color:#EF4444;background:none;border:1px solid #EF4444;
                     border-radius:6px;padding:2px 8px;cursor:pointer;">
              &#9632; Parar
            </button>
          </div>
          <div style="height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden;">
            <div id="bl-progress-bar"
              style="height:100%;background:#0EA5E9;width:20%;border-radius:3px;
                     animation:bl-pulse 1.2s ease-in-out infinite;"></div>
          </div>
        </div>

        <div id="bl-result" style="display:none;margin-top:10px;">
          <div style="font-size:12px;color:#059669;font-weight:500;" id="bl-result-label"></div>
          <button id="bl-csv-btn"
            style="margin-top:8px;width:100%;padding:9px;background:#059669;color:#fff;border:none;
                   border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            &#8595; Baixar CSV
          </button>
        </div>
      </div>

      <!-- SECTION 2: Import CSV -->
      <div style="background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <div style="font-weight:600;font-size:13px;color:#0369A1;margin-bottom:10px;">
          2. Importar CSV para Q10
        </div>
        <div style="font-size:11px;color:#9CA3AF;margin-bottom:8px;">
          Colunas esperadas: <code>telefone,nome</code>
        </div>
        <label style="display:block;border:1.5px dashed #D1D5DB;border-radius:8px;padding:12px;
                      text-align:center;cursor:pointer;font-size:12px;color:#6B7280;">
          <input type="file" id="bl-csv-input" accept=".csv" style="display:none;">
          &#128194; Selecionar arquivo CSV
        </label>

        <div id="bl-import-preview" style="display:none;margin-top:10px;">
          <div style="font-size:12px;color:#374151;font-weight:500;margin-bottom:6px;"
               id="bl-import-count"></div>
          <div style="max-height:120px;overflow-y:auto;border:1px solid #E5E7EB;border-radius:6px;">
            <table style="width:100%;border-collapse:collapse;font-size:11px;" id="bl-import-table">
              <thead>
                <tr style="background:#F3F4F6;">
                  <th style="padding:4px 8px;text-align:left;color:#6B7280;">Telefone</th>
                  <th style="padding:4px 8px;text-align:left;color:#6B7280;">Nome</th>
                </tr>
              </thead>
              <tbody id="bl-import-tbody"></tbody>
            </table>
          </div>
          <button id="bl-import-btn"
            style="margin-top:8px;width:100%;padding:9px;background:#7C3AED;color:#fff;border:none;
                   border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
            &#9654; Enviar para Q10
          </button>
        </div>

        <div id="bl-import-progress" style="display:none;margin-top:10px;">
          <div style="height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden;">
            <div id="bl-import-bar"
              style="height:100%;background:#7C3AED;width:0%;border-radius:3px;transition:width .3s;"></div>
          </div>
          <div style="font-size:12px;color:#374151;margin-top:4px;" id="bl-import-status"></div>
        </div>

        <div id="bl-import-done" style="display:none;margin-top:10px;font-size:12px;"></div>
      </div>

    </div>

    <style>
      .bl-period-active { border-color:#0EA5E9!important; background:#EFF6FF!important; color:#0369A1!important; }
      @keyframes bl-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    </style>
  `;

  bindBatchLeadsEvents();
}

// ================================================================
//  EVENTS
// ================================================================
let _extractedContacts = [];
let _importContacts = [];

function bindBatchLeadsEvents() {
  // Period selector
  document.getElementById('bl-period-btns').addEventListener('click', e => {
    const btn = e.target.closest('.bl-period');
    if (!btn) return;
    document.querySelectorAll('.bl-period').forEach(b => {
      b.classList.remove('bl-period-active');
      b.style.borderColor = '#D1D5DB';
      b.style.background = '#fff';
      b.style.color = '#374151';
    });
    btn.classList.add('bl-period-active');
    btn.style.borderColor = '#0EA5E9';
    btn.style.background = '#EFF6FF';
    btn.style.color = '#0369A1';
  });

  // Extract button
  document.getElementById('bl-extract-btn').addEventListener('click', startExtraction);

  // Stop button
  document.getElementById('bl-stop-btn').addEventListener('click', stopExtraction);

  // CSV download button (set later when data is ready)
  document.getElementById('bl-csv-btn').addEventListener('click', downloadCSV);

  // CSV file input
  document.getElementById('bl-csv-input').addEventListener('change', onCSVFileSelected);

  // Import button
  document.getElementById('bl-import-btn').addEventListener('click', startImport);

  // Start polling for extraction progress
  _startProgressPolling();
}

// ================================================================
//  EXTRACTION
// ================================================================
function getSelectedPeriod() {
  const active = document.querySelector('.bl-period-active');
  return active?.dataset?.period || 'Tudo';
}

function periodToCutoffMs(period) {
  const now = Date.now();
  const map = { '3m': 90, '6m': 180, '1a': 365 };
  const days = map[period];
  if (!days) return null; // "Tudo" = no cutoff
  return now - days * 24 * 60 * 60 * 1000;
}

function startExtraction() {
  const period = getSelectedPeriod();
  const cutoffMs = periodToCutoffMs(period);

  _extractedContacts = [];

  document.getElementById('bl-extract-btn').disabled = true;
  document.getElementById('bl-extract-btn').style.opacity = '0.6';
  document.getElementById('bl-progress').style.display = 'block';
  document.getElementById('bl-result').style.display = 'none';
  document.getElementById('bl-progress-label').textContent = 'Iniciando...';

  chrome.runtime.sendMessage({ action: 'batchExtractStart', cutoffMs }, (resp) => {
    if (resp && !resp.ok) {
      stopExtraction();
      document.getElementById('bl-progress-label').textContent = resp.error || 'Erro ao iniciar';
    }
  });
}

function stopExtraction() {
  chrome.runtime.sendMessage({ action: 'batchExtractStop' });
  document.getElementById('bl-extract-btn').disabled = false;
  document.getElementById('bl-extract-btn').style.opacity = '1';
  document.getElementById('bl-progress').style.display = 'none';
}

let _pollInterval = null;
let _lastStatusTs = 0;

function _startProgressPolling() {
  if (_pollInterval) clearInterval(_pollInterval);
  _pollInterval = setInterval(() => {
    // Auto-stop if the batch leads view was replaced by another view
    if (!document.getElementById('bl-progress')) {
      clearInterval(_pollInterval);
      _pollInterval = null;
      return;
    }
    chrome.storage.session.get(['batchExtractStatus'], result => {
      const s = result.batchExtractStatus;
      if (!s || s.ts === _lastStatusTs) return;
      _lastStatusTs = s.ts;

      if (s.action === 'batchExtractProgress') {
        const label = document.getElementById('bl-progress-label');
        if (label) label.textContent = `${s.count} contatos encontrados...`;
      }

      if (s.action === 'batchExtractComplete') {
        clearInterval(_pollInterval);
        document.getElementById('bl-extract-btn').disabled = false;
        document.getElementById('bl-extract-btn').style.opacity = '1';
        document.getElementById('bl-progress').style.display = 'none';

        if (s.ok && s.data) {
          _extractedContacts = s.data;
          document.getElementById('bl-result').style.display = 'block';
          document.getElementById('bl-result-label').textContent =
            `✓ ${s.data.length} contatos extraídos`;
        } else {
          document.getElementById('bl-progress').style.display = 'block';
          document.getElementById('bl-progress-label').textContent =
            s.error || 'Extração falhou';
          document.getElementById('bl-stop-btn').style.display = 'none';
          document.getElementById('bl-progress-bar').style.animationName = 'none';
          document.getElementById('bl-progress-bar').style.background = '#EF4444';
        }
      }
    });
  }, 600);
}

// ================================================================
//  CSV DOWNLOAD
// ================================================================
function downloadCSV() {
  if (!_extractedContacts.length) return;
  const csvField = v => `"${(v || '').replace(/"/g, '""')}"`;
  const rows = [['telefone', 'nome']];
  _extractedContacts.forEach(c => rows.push([c.phone, csvField(c.name)]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_whatsapp_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ================================================================
//  CSV IMPORT
// ================================================================
function _escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _parseCSVLine(line) {
  // Handles RFC 4180: fields may be quoted, commas inside quotes are preserved
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let val = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val);
      if (line[i] === ',') i++; // skip comma after field
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const firstLine = lines[0].toLowerCase();
  const startIdx = (firstLine.includes('telefone') || firstLine.includes('phone')) ? 1 : 0;
  return lines.slice(startIdx).map(line => {
    const fields = _parseCSVLine(line);
    const phone = (fields[0] || '').trim().replace(/\D/g, '');
    const name = (fields[1] || '').trim();
    return { phone, name };
  }).filter(c => c.phone.length >= 7);
}

function onCSVFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    _importContacts = parseCSV(ev.target.result);
    showImportPreview();
  };
  reader.readAsText(file, 'UTF-8');
}

function showImportPreview() {
  const preview = document.getElementById('bl-import-preview');
  const tbody = document.getElementById('bl-import-tbody');
  const countEl = document.getElementById('bl-import-count');

  countEl.textContent = `${_importContacts.length} contatos carregados`;
  tbody.innerHTML = _importContacts.slice(0, 50).map(c => `
    <tr>
      <td style="padding:3px 8px;border-top:1px solid #F3F4F6;">${_escHtml(c.phone)}</td>
      <td style="padding:3px 8px;border-top:1px solid #F3F4F6;">${_escHtml(c.name) || '—'}</td>
    </tr>
  `).join('');
  if (_importContacts.length > 50) {
    tbody.innerHTML += `<tr><td colspan="2" style="padding:4px 8px;color:#9CA3AF;font-size:11px;">
      ... e mais ${_importContacts.length - 50} contatos</td></tr>`;
  }
  preview.style.display = 'block';
}

async function startImport() {
  if (!_importContacts.length) return;

  document.getElementById('bl-import-btn').disabled = true;
  document.getElementById('bl-import-progress').style.display = 'block';
  document.getElementById('bl-import-done').style.display = 'none';

  const BATCH = 10;
  let done = 0;
  let okTotal = 0;
  let failTotal = 0;

  const statusEl = document.getElementById('bl-import-status');
  const barEl = document.getElementById('bl-import-bar');

  for (let i = 0; i < _importContacts.length; i += BATCH) {
    const chunk = _importContacts.slice(i, i + BATCH);
    await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'batchImportContacts', contacts: chunk }, resp => {
        if (resp && resp.ok && resp.data) {
          okTotal += resp.data.summary.ok;
          failTotal += resp.data.summary.fail;
        } else {
          failTotal += chunk.length;
        }
        done += chunk.length;
        const pct = Math.round((done / _importContacts.length) * 100);
        barEl.style.width = pct + '%';
        statusEl.textContent = `${done}/${_importContacts.length} enviados...`;
        resolve();
      });
    });
  }

  document.getElementById('bl-import-progress').style.display = 'none';
  document.getElementById('bl-import-btn').disabled = false;
  const doneEl = document.getElementById('bl-import-done');
  doneEl.style.display = 'block';
  doneEl.innerHTML = `
    <span style="color:#059669;font-weight:600;">✓ ${okTotal} importados</span>
    ${failTotal ? `<span style="color:#EF4444;margin-left:8px;">✗ ${failTotal} falhas</span>` : ''}
  `;
}
