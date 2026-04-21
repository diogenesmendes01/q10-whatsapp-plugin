/* ============================================================
   Q10 CRM — Side Panel
   Module: Event Handlers
   v3.0
   ============================================================ */

window.Q10SidePanel = window.Q10SidePanel || {};

const { api, dom, state } = window.Q10SidePanel;
const { sendMsg, showToast, fetchStudentFinancials } = api;
const { escHtml, htmlText, htmlAttr, fullNameHtml, body, showActions, hideActions, fmtMoney } = dom;
const { WIZARD_STEPS, AVAILABLE_TAGS } = state;

// ================================================================
//  Tags Handlers
// ================================================================
async function getContactTags(contactId) {
  return new Promise(resolve => {
    chrome.storage.local.get(['tags_' + contactId], (result) => {
      resolve(result['tags_' + contactId] || []);
    });
  });
}

async function setContactTags(contactId, tags) {
  return new Promise(resolve => {
    chrome.storage.local.set({ ['tags_' + contactId]: tags }, resolve);
  });
}

function renderTagsSection(contactId, existingTags) {
  const contactAttr = htmlAttr(contactId);
  return `
    <div class="q10-tags-section">
      <div class="q10-tags-header">
        <span class="q10-tags-title">${icon('clipboard')} Etiquetas</span>
      </div>
      <div class="q10-tags-list" id="q10-tags-${contactAttr}">
        ${AVAILABLE_TAGS.map(t => {
          const active = existingTags.includes(t.id);
          return `<button class="q10-tag ${active ? 'q10-tag-active' : ''}"
            data-tag="${htmlAttr(t.id)}" data-contact="${contactAttr}"
            style="--tag-color: ${t.color}; --tag-bg: ${t.bg}">
            ${htmlText(t.label)}
          </button>`;
        }).join('')}
      </div>
    </div>
  `;
}

function bindTagsHandlers() {
  document.querySelectorAll('.q10-tag').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tagId = btn.dataset.tag;
      const contactId = btn.dataset.contact;
      let tags = await getContactTags(contactId);
      if (tags.includes(tagId)) {
        tags = tags.filter(t => t !== tagId);
      } else {
        tags.push(tagId);
      }
      await setContactTags(contactId, tags);
      btn.classList.toggle('q10-tag-active');
    });
  });
}

// ================================================================
//  Notes Handlers
// ================================================================
async function getContactNotes(contactId) {
  return new Promise(resolve => {
    chrome.storage.local.get(['notes_' + contactId], (result) => {
      resolve(result['notes_' + contactId] || []);
    });
  });
}

async function addContactNote(contactId, text) {
  const notes = await getContactNotes(contactId);
  notes.unshift({
    id: Date.now().toString(),
    text,
    date: new Date().toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    timestamp: Date.now()
  });
  if (notes.length > 20) notes.pop();
  return new Promise(resolve => {
    chrome.storage.local.set({ ['notes_' + contactId]: notes }, resolve);
  });
}

async function deleteContactNote(contactId, noteId) {
  let notes = await getContactNotes(contactId);
  notes = notes.filter(n => n.id !== noteId);
  return new Promise(resolve => {
    chrome.storage.local.set({ ['notes_' + contactId]: notes }, resolve);
  });
}

async function renderNotesSection(contactId) {
  const notes = await getContactNotes(contactId);
  const contactAttr = htmlAttr(contactId);
  return `
    <div class="q10-notes-section">
      <div class="q10-notes-header">
        <span class="q10-notes-title">${icon('fileText')} Notas</span>
      </div>
      <div class="q10-notes-input-wrap">
        <textarea id="q10-note-input" class="q10-note-textarea"
          placeholder="Agregar nota..." rows="2"></textarea>
        <button id="q10-note-add" class="q10-btn q10-btn-sm q10-btn-primary">
          ${icon('plus')} Agregar
        </button>
      </div>
      <div class="q10-notes-list" id="q10-notes-list">
        ${notes.map(n => `
          <div class="q10-note-card" data-note-id="${htmlAttr(n.id)}">
            <div class="q10-note-date">${htmlText(n.date, '')}</div>
            <div class="q10-note-text">${htmlText(n.text, '')}</div>
            <button class="q10-note-delete" data-note-id="${htmlAttr(n.id)}" data-contact="${contactAttr}">✕</button>
          </div>
        `).join('')}
        ${notes.length === 0 ? '<p class="q10-notes-empty">Sin notas aún</p>' : ''}
      </div>
    </div>
  `;
}

// Attach tags and notes sections + event handlers to the current view
async function attachTagsAndNotes(contactId) {
  const container = document.getElementById('q10-tags-notes-container');
  if (!container) return;

  const tags = await getContactTags(contactId);
  const tagsHtml = renderTagsSection(contactId, tags);
  const notesHtml = await renderNotesSection(contactId);
  container.innerHTML = tagsHtml + notesHtml;

  bindTagsHandlers();
  bindNotesHandlers(contactId);
}

function bindNotesHandlers(contactId) {
  document.getElementById('q10-note-add')?.addEventListener('click', async () => {
    const input = document.getElementById('q10-note-input');
    const text = input.value.trim();
    if (!text) return;
    await addContactNote(contactId, text);
    input.value = '';
    const notesHtml = await renderNotesSection(contactId);
    const notesSection = document.querySelector('.q10-notes-section');
    if (notesSection) {
      notesSection.outerHTML = notesHtml;
      bindNotesHandlers(contactId);
    }
  });

  document.querySelectorAll('.q10-note-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const noteId = btn.dataset.noteId;
      const cId = btn.dataset.contact;
      await deleteContactNote(cId, noteId);
      const card = btn.closest('.q10-note-card');
      if (card) card.remove();
      const list = document.getElementById('q10-notes-list');
      if (list && list.querySelectorAll('.q10-note-card').length === 0) {
        list.innerHTML = '<p class="q10-notes-empty">Sin notas aún</p>';
      }
    });
  });
}

function bindExportButtons() {
  document.getElementById('q10-export-data')?.addEventListener('click', api.exportAllData);
  document.getElementById('q10-export-chat')?.addEventListener('click', api.exportConversation);
}

// ================================================================
//  Search
// ================================================================
function searchPhone(phone) {
  if (!phone) return;
  state.setCurrentPhone(phone);
  dom.renderLoading();

  chrome.runtime.sendMessage({ action: 'searchPhone', phone }, (resp) => {
    if (chrome.runtime.lastError) { dom.renderError('Erro de comunicação. Recarregue a extensão.'); return; }
    if (!resp || !resp.ok) { dom.renderError(resp?.error || 'Erro desconhecido.'); return; }
    dom.renderResult(resp.data);
  });
}

// ================================================================
//  Wizard Handlers
// ================================================================
function startEnrollmentWizard(phone, existingData) {
  state.setWizardState({
    step: 0,
    phone: phone || state.getCurrentPhone(),
    prefill: existingData || {},
    results: {}
  });

  if (!state.getCatalogsCache()) {
    body().innerHTML = `<div class="q10-state"><div class="q10-spinner"></div><div class="q10-state-title">Cargando catálogos...</div></div>`;
    hideActions();
    sendMsg('fetchCatalogs')
      .then(data => {
        state.setCatalogsCache(data);
        dom.renderWizardStep();
      })
      .catch(err => {
        dom.renderError('Error cargando catálogos: ' + err.message);
      });
    return;
  }

  dom.renderWizardStep();
}

function cancelWizard() {
  state.setWizardState(null);
  const result = state.getCurrentResult();
  if (result) dom.renderResult(result);
  else if (state.getCurrentPhone()) searchPhone(state.getCurrentPhone());
  else dom.renderNoConversation();
}

async function refreshFinancials(studentData) {
  const btn = document.getElementById('q10-refresh-fin');
  if (btn) { btn.disabled = true; btn.innerHTML = `${icon('refresh','q10-btn-icon')} Cargando...`; }
  try {
    const fin = await fetchStudentFinancials(studentData.Codigo);
    const currentResult = state.getCurrentResult();
    if (currentResult && currentResult.type === 'estudiante') {
      currentResult.estadoCuenta = fin.estadoCuenta;
      currentResult.pagosPendientes = fin.pagosPendientes;
      state.setCurrentResult(currentResult);
      dom.renderEstudiante(currentResult);
      showToast('Datos financieros actualizados', 'success');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `${icon('refresh','q10-btn-icon')} Actualizar Financiero`; }
  }
}

window.Q10SidePanel.handlers = {
  getContactTags,
  setContactTags,
  renderTagsSection,
  bindTagsHandlers,
  getContactNotes,
  addContactNote,
  deleteContactNote,
  renderNotesSection,
  attachTagsAndNotes,
  bindNotesHandlers,
  bindExportButtons,
  searchPhone,
  startEnrollmentWizard,
  cancelWizard,
  refreshFinancials,
};
