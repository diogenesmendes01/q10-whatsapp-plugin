/* ============================================================
   Q10 CRM — Side Panel Script
   All panel rendering logic, wizard, modals.
   Communicates with service worker for API + with content script
   via chrome.storage.session for phone detection.
   v3.0
   ============================================================ */

(function () {
  'use strict';

  // ================================================================
  //  SVG ICONS
  // ================================================================
  const ICONS = {
    logo: `<svg viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="6" fill="white" fill-opacity="0.2"/><text x="14" y="20" text-anchor="middle" font-size="16" font-weight="bold" fill="white" font-family="Inter,sans-serif">Q</text></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>`,
    briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>`,
    activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
    externalLink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    alertCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
    userPlus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    graduation: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/></svg>`,
    dollar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    arrowLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    fileText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>`,
  };

  // ================================================================
  //  STATE
  // ================================================================
  let currentPhone = null;
  let currentContactName = null;
  let currentResult = null;
  let wizardState = null;
  let catalogsCache = null;

  // ================================================================
  //  HELPERS
  // ================================================================
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  function icon(name, cls) {
    return `<span class="${cls || ''}">${ICONS[name] || ''}</span>`;
  }

  function fullName(d) {
    if (!d) return '—';
    return [d.Primer_nombre, d.Segundo_nombre, d.Primer_apellido, d.Segundo_apellido]
      .filter(Boolean).join(' ');
  }

  function showToast(text, type = '') {
    const existing = document.querySelector('.q10-toast');
    if (existing) existing.remove();
    const t = el('div', `q10-toast ${type ? 'q10-toast-' + type : ''}`, text);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function sendMsg(action, extra = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...extra }, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!resp) return reject(new Error('No response'));
        if (!resp.ok) return reject(new Error(resp.error || 'Unknown error'));
        resolve(resp.data);
      });
    });
  }

  function fmtMoney(v) {
    return '$ ' + Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 });
  }

  // ================================================================
  //  CSV EXPORT HELPERS
  // ================================================================
  function generateCSV(data) {
    if (!data || !data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(item =>
      headers.map(h => {
        let val = item[h] || '';
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportAllData() {
    renderLoading('Exportando datos...');

    chrome.runtime.sendMessage({ action: 'exportAll' }, (resp) => {
      if (!resp || !resp.ok) {
        showToast('Error al exportar', 'error');
        restoreView();
        return;
      }

      const { contactos, estudiantes, oportunidades } = resp.data;
      const timestamp = new Date().toISOString().slice(0, 10);

      if (contactos?.length) downloadCSV(generateCSV(contactos), `contactos_${timestamp}.csv`);
      if (estudiantes?.length) downloadCSV(generateCSV(estudiantes), `estudiantes_${timestamp}.csv`);
      if (oportunidades?.length) downloadCSV(generateCSV(oportunidades), `oportunidades_${timestamp}.csv`);

      showToast(`Exportados: ${contactos?.length || 0} contactos, ${estudiantes?.length || 0} estudiantes, ${oportunidades?.length || 0} oportunidades`, 'success');
      restoreView();
    });
  }

  function exportConversation() {
    renderLoading('Exportando conversación...');

    chrome.runtime.sendMessage({ action: 'exportConversation' }, (resp) => {
      if (!resp || !resp.ok || !resp.data?.length) {
        showToast('No se pudieron extraer mensajes', 'error');
        restoreView();
        return;
      }

      const messages = resp.data;
      const timestamp = new Date().toISOString().slice(0, 10);
      const contactName = currentResult?.data?.Nombres || currentResult?.data?.Primer_nombre || currentPhone || 'chat';

      // Generate text format
      const text = messages.map(m => {
        const dir = m.direction === 'sent' ? '→ Yo' : '← Contacto';
        return `[${m.time}] ${dir}: ${m.text}`;
      }).join('\n');

      const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat_${contactName.replace(/\s+/g, '_')}_${timestamp}.txt`;
      a.click();
      URL.revokeObjectURL(url);

      showToast(`${messages.length} mensajes exportados`, 'success');
      restoreView();
    });
  }

  function restoreView() {
    if (currentResult) {
      if (currentResult.type === 'estudiante') renderEstudiante(currentResult);
      else if (currentResult.type === 'contacto') renderContacto(currentResult.data || currentResult);
      else if (currentResult.type === 'oportunidad') renderOportunidad(currentResult);
      else renderNoConversation();
    } else {
      renderNoConversation();
    }
  }

  function bindExportButtons() {
    document.getElementById('q10-export-data')?.addEventListener('click', exportAllData);
    document.getElementById('q10-export-chat')?.addEventListener('click', exportConversation);
  }

  // ================================================================
  //  TAGS SYSTEM
  // ================================================================
  const AVAILABLE_TAGS = [
    { id: 'interested', label: 'Interesado', color: '#3B82F6', bg: '#EFF6FF' },
    { id: 'enrolled', label: 'Matriculado', color: '#10B981', bg: '#ECFDF5' },
    { id: 'active', label: 'Activo', color: '#059669', bg: '#D1FAE5' },
    { id: 'inactive', label: 'Inactivo', color: '#6B7280', bg: '#F3F4F6' },
    { id: 'overdue', label: 'Mora', color: '#EF4444', bg: '#FEF2F2' },
    { id: 'vip', label: 'VIP', color: '#F59E0B', bg: '#FFFBEB' },
    { id: 'referral', label: 'Referido', color: '#8B5CF6', bg: '#F5F3FF' },
    { id: 'prospect', label: 'Prospecto', color: '#EC4899', bg: '#FDF2F8' },
  ];

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
    return `
      <div class="q10-tags-section">
        <div class="q10-tags-header">
          <span class="q10-tags-title">${icon('clipboard')} Etiquetas</span>
        </div>
        <div class="q10-tags-list" id="q10-tags-${contactId}">
          ${AVAILABLE_TAGS.map(t => {
            const active = existingTags.includes(t.id);
            return `<button class="q10-tag ${active ? 'q10-tag-active' : ''}" 
              data-tag="${t.id}" data-contact="${contactId}"
              style="--tag-color: ${t.color}; --tag-bg: ${t.bg}">
              ${t.label}
            </button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ================================================================
  //  NOTES SYSTEM
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
            <div class="q10-note-card" data-note-id="${n.id}">
              <div class="q10-note-date">${n.date}</div>
              <div class="q10-note-text">${escapeHtml(n.text)}</div>
              <button class="q10-note-delete" data-note-id="${n.id}" data-contact="${contactId}">✕</button>
            </div>
          `).join('')}
          ${notes.length === 0 ? '<p class="q10-notes-empty">Sin notas aún</p>' : ''}
        </div>
      </div>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

  function bindNotesHandlers(contactId) {
    document.getElementById('q10-note-add')?.addEventListener('click', async () => {
      const input = document.getElementById('q10-note-input');
      const text = input.value.trim();
      if (!text) return;
      await addContactNote(contactId, text);
      input.value = '';
      // Re-render notes section
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
        // Show empty state if no more notes
        const list = document.getElementById('q10-notes-list');
        if (list && list.querySelectorAll('.q10-note-card').length === 0) {
          list.innerHTML = '<p class="q10-notes-empty">Sin notas aún</p>';
        }
      });
    });
  }


  // ================================================================
  //  SIMPLE RENDER STATES
  // ================================================================
  function body() { return document.getElementById('q10-body'); }
  function actions() { return document.getElementById('q10-actions'); }
  function hideActions() { actions().style.display = 'none'; actions().innerHTML = ''; }
  function showActions(html) { const a = actions(); a.style.display = 'flex'; a.innerHTML = html; }

  function renderLoading(msg) {
    body().innerHTML = `
      <div class="q10-state">
        <div class="q10-spinner"></div>
        <div class="q10-state-title">${msg || 'Buscando no Q10...'}</div>
        <div class="q10-state-text">Procurando dados do contato</div>
      </div>`;
    hideActions();
  }

  function renderNoApiKey() {
    // API key not configured — show empty state
    renderNoConversation();
  }

  function renderNoConversation() {
    hideActions();
    body().innerHTML = `
      <div class="q10-empty">
        <div class="q10-empty-icon">${icon('search')}</div>
        <p class="q10-empty-title">Sin conversación activa</p>
        <p class="q10-empty-desc">Abre una conversación en WhatsApp o busca manualmente:</p>
        <div class="q10-manual-search">
          <input type="text" id="q10-manual-input" placeholder="Teléfono o nombre..." class="q10-input" />
          <button id="q10-manual-btn" class="q10-btn q10-btn-primary">
            ${icon('search')} Buscar
          </button>
        </div>
      </div>
    `;
    
    const input = document.getElementById('q10-manual-input');
    const btn = document.getElementById('q10-manual-btn');
    
    btn.addEventListener('click', () => {
      const value = input.value.trim();
      if (!value) return;
      // Detect if it's a phone or name
      const isPhone = /^\+?\d[\d\s\-]{7,}$/.test(value.replace(/[\s\-]/g, ''));
      if (isPhone) {
        searchPhone(value.replace(/[\s\-\(\)]/g, ''));
      } else {
        renderLoading('Buscando: ' + value + '...');
        chrome.runtime.sendMessage({ action: 'searchName', name: value }, (resp) => {
          if (resp && resp.ok) {
            currentResult = resp.data;
            if (resp.data.type === 'unknown') renderUnknown(value);
            else if (resp.data.type === 'estudiante') renderEstudiante(resp.data);
            else if (resp.data.type === 'contacto') renderContacto(resp.data);
            else if (resp.data.type === 'oportunidad') renderOportunidad(resp.data);
          } else {
            renderUnknown(value);
          }
        });
      }
    });
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });
  }

  function renderError(msg) {
    body().innerHTML = `
      <div class="q10-state">
        <span class="q10-state-icon" style="color:#EF4444">${ICONS.alertCircle}</span>
        <div class="q10-state-title">Erro</div>
        <div class="q10-state-text">${msg}</div>
        <button class="q10-btn q10-btn-outline" id="q10-retry">Tentar novamente</button>
      </div>`;
    hideActions();
    document.getElementById('q10-retry').addEventListener('click', () => {
      if (currentPhone) searchPhone(currentPhone);
    });
  }

  // ================================================================
  //  PHONE DISPLAY WIDGET
  // ================================================================
  function formatPhone(raw) {
    if (!raw) return '';
    const digits = raw.replace(/\D/g, '');
    // Brazilian number: 55 + 2 DDD + 9 digits = 13
    if (digits.length === 13 && digits.startsWith('55')) {
      return `+${digits.slice(0,2)} ${digits.slice(2,4)} ${digits.slice(4,9)}-${digits.slice(9)}`;
    }
    // Brazilian number without 9th digit: 55 + 2 DDD + 8 digits = 12
    if (digits.length === 12 && digits.startsWith('55')) {
      return `+${digits.slice(0,2)} ${digits.slice(2,4)} ${digits.slice(4,8)}-${digits.slice(8)}`;
    }
    // Guatemala: 502 + 8 digits = 11
    if (digits.length === 11 && digits.startsWith('502')) {
      return `+${digits.slice(0,3)} ${digits.slice(3,7)}-${digits.slice(7)}`;
    }
    // Generic: add + if not present
    if (digits.length >= 10) {
      return '+' + digits;
    }
    return raw;
  }

  function phoneHtml(phone) {
    return `<div class="q10-phone-display">
      <span class="q10-phone-icon">${ICONS.phone}</span>
      <span class="q10-phone-number">${formatPhone(phone)}</span>
    </div>`;
  }

  // ================================================================
  //  RENDER: UNKNOWN CONTACT
  // ================================================================
  function renderUnknown(phoneOrName) {
    // Detect if it's a phone or a name
    const isPhone = /^\+?\d[\d\s\-]{7,}$/.test((phoneOrName || '').replace(/[\s\-]/g, ''));
    const detectedPhone = isPhone ? phoneOrName : currentPhone;
    const detectedName = isPhone ? currentContactName : (phoneOrName || currentContactName);

    const displayHtml = isPhone 
      ? phoneHtml(detectedPhone)
      : `<div class="q10-phone-display"><span class="q10-phone-icon">${ICONS.user}</span><span class="q10-phone-number">${detectedName}</span></div>`;

    body().innerHTML = `
      ${displayHtml}
      <div class="q10-state">
        <span class="q10-state-icon">${ICONS.userPlus}</span>
        <div class="q10-state-title">Contacto no encontrado</div>
        <div class="q10-state-text">${isPhone ? 'Este número no está registrado en Q10.' : 'Este contacto no está registrado en Q10.'}</div>
      </div>`;
    showActions(`
      <button class="q10-btn q10-btn-cta" id="q10-start-enrollment">${icon('graduation','q10-btn-icon')} Matricular Alumno</button>
      <button class="q10-btn q10-btn-primary" id="q10-create-lead">${icon('plus','q10-btn-icon')} Crear Oportunidad</button>
      <button class="q10-btn q10-btn-outline" id="q10-create-contacto-only">${icon('userPlus','q10-btn-icon')} Registrar Contacto</button>
    `);
    document.getElementById('q10-start-enrollment').addEventListener('click', () => startEnrollmentWizard(detectedPhone, detectedName));
    document.getElementById('q10-create-lead').addEventListener('click', () => showCreateOportunidadModal(detectedPhone, detectedName));
    document.getElementById('q10-create-contacto-only').addEventListener('click', () => showCreateContactoModal(detectedPhone, detectedName));
  }

  // ================================================================
  //  RENDER: ESTUDIANTE
  // ================================================================
  function renderEstudiante(result) {
    const d = result.data;
    const name = fullName(d);
    const phone = d.Celular || d.Telefono || currentPhone;

    let financialHtml = '';

    if (result.estadoCuenta) {
      const ec = result.estadoCuenta;
      const saldo = parseFloat(ec.Saldo || ec.Saldo_pendiente || ec.Total_pendiente || 0);
      financialHtml += `
        <div class="q10-section">
          <div class="q10-section-title">${icon('dollar','q10-section-icon')} Estado de Cuenta</div>
          <div class="q10-info-card">
            <div class="q10-info-row">
              <span class="q10-info-label">Saldo</span>
              <span class="q10-info-value">
                <span class="q10-badge ${saldo > 0 ? 'q10-badge-red' : 'q10-badge-green'}">${fmtMoney(saldo)}</span>
              </span>
            </div>
            ${ec.Total_pagado !== undefined ? `<div class="q10-info-row"><span class="q10-info-label">Total Pagado</span><span class="q10-info-value">${fmtMoney(ec.Total_pagado)}</span></div>` : ''}
            ${ec.Total_cobrado !== undefined ? `<div class="q10-info-row"><span class="q10-info-label">Total Cobrado</span><span class="q10-info-value">${fmtMoney(ec.Total_cobrado)}</span></div>` : ''}
          </div>
        </div>`;
    }

    if (result.pagosPendientes && result.pagosPendientes.length > 0) {
      financialHtml += `
        <div class="q10-section">
          <div class="q10-section-title">${icon('alertCircle','q10-section-icon')} Pagos Pendientes (${result.pagosPendientes.length})</div>
          ${result.pagosPendientes.map(p => `
            <div class="q10-info-card" style="border-left:3px solid #EF4444;">
              <div class="q10-info-row"><span class="q10-info-label">Concepto</span><span class="q10-info-value">${p.Concepto || p.Descripcion || p.Nombre || '—'}</span></div>
              <div class="q10-info-row"><span class="q10-info-label">Valor</span><span class="q10-info-value"><span class="q10-badge q10-badge-red">${fmtMoney(p.Valor || p.Monto || p.Saldo)}</span></span></div>
              ${p.Fecha_vencimiento ? `<div class="q10-info-row"><span class="q10-info-label">Vencimiento</span><span class="q10-info-value">${new Date(p.Fecha_vencimiento).toLocaleDateString('es')}</span></div>` : ''}
            </div>
          `).join('')}
        </div>`;
    } else if (result.estadoCuenta) {
      financialHtml += `
        <div class="q10-section">
          <div class="q10-section-title">${icon('check','q10-section-icon')} Pagos Pendientes</div>
          <div class="q10-info-card" style="border-left:3px solid #10B981; text-align:center; padding:16px;">
            <span style="color:#065F46;font-weight:600;font-size:13px;">✅ Sin pagos pendientes</span>
          </div>
        </div>`;
    }

    body().innerHTML = `
      ${phoneHtml(phone)}
      <span class="q10-contact-type q10-type-estudiante">${icon('graduation','q10-section-icon')} Estudiante</span>
      <div class="q10-contact-name">${name}</div>
      <div class="q10-contact-id">ID: ${d.Codigo || '—'} · ${d.Numero_identificacion || ''}</div>
      <div class="q10-section">
        <div class="q10-section-title">${icon('user','q10-section-icon')} Información Personal</div>
        <div class="q10-info-card">
          <div class="q10-info-row"><span class="q10-info-label">Email</span><span class="q10-info-value">${d.Email||'—'}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Teléfono</span><span class="q10-info-value">${d.Telefono||'—'}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Celular</span><span class="q10-info-value">${d.Celular||'—'}</span></div>
        </div>
      </div>
      <div class="q10-section">
        <div class="q10-section-title">${icon('book','q10-section-icon')} Académico</div>
        <div class="q10-info-card">
          <div class="q10-info-row"><span class="q10-info-label">Programa</span><span class="q10-info-value">${d.Programa||d.Nombre_programa||'—'}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Estado Matrícula</span>
            <span class="q10-info-value"><span class="q10-badge ${d.Estado_matricula==='Activo'?'q10-badge-green':'q10-badge-gray'}">${d.Estado_matricula||'—'}</span></span>
          </div>
          <div class="q10-info-row"><span class="q10-info-label">Periodo</span><span class="q10-info-value">${d.Periodo||d.Nombre_periodo||'—'}</span></div>
        </div>
      </div>
      ${financialHtml}
      <div id="q10-tags-notes-container"></div>
    `;

    // Attach tags & notes (async, fills container after render)
    const contactIdEst = d.Codigo || 'unknown';
    attachTagsAndNotes(contactIdEst);

    showActions(`
      <button class="q10-btn q10-btn-cta" id="q10-gen-cobro">${icon('dollar','q10-btn-icon')} Generar Cobro</button>
      <button class="q10-btn q10-btn-success" id="q10-log-activity">${icon('clipboard','q10-btn-icon')} Registrar Actividad</button>
      <button class="q10-btn q10-btn-outline" id="q10-refresh-fin">${icon('refresh','q10-btn-icon')} Actualizar Financiero</button>
      <button class="q10-btn q10-btn-secondary" id="q10-export-data">${icon('clipboard','q10-btn-icon')} Exportar Datos</button>
      <button class="q10-btn q10-btn-secondary" id="q10-export-chat">${icon('fileText','q10-btn-icon')} Exportar Chat</button>
      <button class="q10-btn q10-btn-outline" id="q10-view-q10">${icon('externalLink','q10-btn-icon')} Ver en Q10</button>
    `);
    bindExportButtons();

    document.getElementById('q10-gen-cobro').addEventListener('click', () => showGenerarCobroModal(d));
    document.getElementById('q10-log-activity').addEventListener('click', () => showCreateActividadModal(d));
    document.getElementById('q10-refresh-fin').addEventListener('click', () => refreshFinancials(d));
    document.getElementById('q10-view-q10').addEventListener('click', () => window.open('https://app.q10.com', '_blank'));
  }

  async function refreshFinancials(studentData) {
    const btn = document.getElementById('q10-refresh-fin');
    if (btn) { btn.disabled = true; btn.innerHTML = `${icon('refresh','q10-btn-icon')} Cargando...`; }
    try {
      const fin = await sendMsg('fetchStudentFinancials', { codigoEstudiante: studentData.Codigo });
      if (currentResult && currentResult.type === 'estudiante') {
        currentResult.estadoCuenta = fin.estadoCuenta;
        currentResult.pagosPendientes = fin.pagosPendientes;
        renderEstudiante(currentResult);
        showToast('Datos financieros actualizados', 'success');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = `${icon('refresh','q10-btn-icon')} Actualizar Financiero`; }
    }
  }

  // ================================================================
  //  RENDER: OPORTUNIDAD
  // ================================================================
  function renderOportunidad(result) {
    const d = result.data;
    const name = fullName(d);

    let negociosHtml = '';
    if (result.negocios && result.negocios.length > 0) {
      negociosHtml = `
        <div class="q10-section">
          <div class="q10-section-title">${icon('briefcase','q10-section-icon')} Negocios</div>
          ${result.negocios.map(n => `
            <div class="q10-info-card">
              <div class="q10-info-row"><span class="q10-info-label">Negocio</span><span class="q10-info-value">${n.Nombre||n.Descripcion||'—'}</span></div>
              <div class="q10-info-row"><span class="q10-info-label">Valor</span><span class="q10-info-value">${fmtMoney(n.Valor)}</span></div>
              <div class="q10-info-row"><span class="q10-info-label">Estado</span><span class="q10-info-value"><span class="q10-badge q10-badge-blue">${n.Estado||'—'}</span></span></div>
            </div>`).join('')}
        </div>`;
    }

    let actividadesHtml = '';
    if (result.actividades && result.actividades.length > 0) {
      actividadesHtml = `
        <div class="q10-section">
          <div class="q10-section-title">${icon('activity','q10-section-icon')} Actividades Recientes</div>
          ${result.actividades.map(a => `
            <div class="q10-activity-item">
              <div class="q10-activity-type">${a.Tipo||'Actividad'}</div>
              <div class="q10-activity-desc">${a.Descripcion||a.Observaciones||'—'}</div>
              <div class="q10-activity-date">${a.Fecha?new Date(a.Fecha).toLocaleDateString('es'):''}</div>
            </div>`).join('')}
        </div>`;
    }

    body().innerHTML = `
      ${phoneHtml(d.Celular||d.Telefono||currentPhone)}
      <span class="q10-contact-type q10-type-oportunidad">${icon('briefcase','q10-section-icon')} Lead / Oportunidad</span>
      <div class="q10-contact-name">${name}</div>
      <div class="q10-contact-id">ID: ${d.Codigo||'—'}</div>
      <div class="q10-section">
        <div class="q10-section-title">${icon('user','q10-section-icon')} Información</div>
        <div class="q10-info-card">
          <div class="q10-info-row"><span class="q10-info-label">Email</span><span class="q10-info-value">${d.Email||'—'}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Teléfono</span><span class="q10-info-value">${d.Telefono||'—'}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Celular</span><span class="q10-info-value">${d.Celular||'—'}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Estado</span><span class="q10-info-value"><span class="q10-badge q10-badge-yellow">${d.Estado||d.Etapa||'—'}</span></span></div>
        </div>
      </div>
      ${negociosHtml}
      ${actividadesHtml}
      <div id="q10-tags-notes-container"></div>
    `;

    // Attach tags & notes
    const contactIdOp = d.Codigo || d.Codigo_contacto || 'unknown';
    attachTagsAndNotes(contactIdOp);

    showActions(`
      <button class="q10-btn q10-btn-cta" id="q10-start-enrollment">${icon('graduation','q10-btn-icon')} Matricular Alumno</button>
      <button class="q10-btn q10-btn-success" id="q10-log-activity">${icon('clipboard','q10-btn-icon')} Registrar Actividad</button>
      <button class="q10-btn q10-btn-secondary" id="q10-export-data">${icon('clipboard','q10-btn-icon')} Exportar Datos</button>
      <button class="q10-btn q10-btn-secondary" id="q10-export-chat">${icon('fileText','q10-btn-icon')} Exportar Chat</button>
      <button class="q10-btn q10-btn-outline" id="q10-view-q10">${icon('externalLink','q10-btn-icon')} Ver en Q10</button>
    `);
    bindExportButtons();

    document.getElementById('q10-start-enrollment').addEventListener('click', () => {
      startEnrollmentWizard(d.Celular || d.Telefono || currentPhone, d);
    });
    document.getElementById('q10-log-activity').addEventListener('click', () => showCreateActividadModal(d));
    document.getElementById('q10-view-q10').addEventListener('click', () => window.open('https://app.q10.com', '_blank'));
  }

  // ================================================================
  //  RENDER: CONTACTO
  // ================================================================
  function renderContacto(data) {
    const name = fullName(data);
    body().innerHTML = `
      ${phoneHtml(data.Celular||data.Telefono||currentPhone)}
      <span class="q10-contact-type q10-type-contacto">${icon('user','q10-section-icon')} Contacto</span>
      <div class="q10-contact-name">${name}</div>
      <div class="q10-contact-id">ID: ${data.Codigo||'—'} · ${data.Numero_identificacion||''}</div>
      <div class="q10-section">
        <div class="q10-section-title">${icon('user','q10-section-icon')} Información</div>
        <div class="q10-info-card">
          <div class="q10-info-row"><span class="q10-info-label">Email</span><span class="q10-info-value">${data.Email||'—'}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Teléfono</span><span class="q10-info-value">${data.Telefono||'—'}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Celular</span><span class="q10-info-value">${data.Celular||'—'}</span></div>
        </div>
      </div>
      <div id="q10-tags-notes-container"></div>`;

    // Attach tags & notes
    const contactIdCt = data.Codigo || data.Codigo_contacto || 'unknown';
    attachTagsAndNotes(contactIdCt);

    showActions(`
      <button class="q10-btn q10-btn-cta" id="q10-start-enrollment">${icon('graduation','q10-btn-icon')} Matricular Alumno</button>
      <button class="q10-btn q10-btn-primary" id="q10-create-lead">${icon('plus','q10-btn-icon')} Crear Oportunidad</button>
      <button class="q10-btn q10-btn-success" id="q10-log-activity">${icon('clipboard','q10-btn-icon')} Registrar Actividad</button>
      <button class="q10-btn q10-btn-secondary" id="q10-export-data">${icon('clipboard','q10-btn-icon')} Exportar Datos</button>
      <button class="q10-btn q10-btn-secondary" id="q10-export-chat">${icon('fileText','q10-btn-icon')} Exportar Chat</button>
      <button class="q10-btn q10-btn-outline" id="q10-view-q10">${icon('externalLink','q10-btn-icon')} Ver en Q10</button>
    `);
    bindExportButtons();

    document.getElementById('q10-start-enrollment').addEventListener('click', () => {
      startEnrollmentWizard(data.Celular || data.Telefono || currentPhone, data);
    });
    document.getElementById('q10-create-lead').addEventListener('click', () => showCreateOportunidadModal(currentPhone, data));
    document.getElementById('q10-log-activity').addEventListener('click', () => showCreateActividadModal(data));
    document.getElementById('q10-view-q10').addEventListener('click', () => window.open('https://app.q10.com', '_blank'));
  }

  // ================================================================
  //  RENDER DISPATCHER
  // ================================================================
  function renderResult(result) {
    currentResult = result;
    switch (result.type) {
      case 'estudiante': renderEstudiante(result); break;
      case 'oportunidad': renderOportunidad(result); break;
      case 'contacto': renderContacto(result.data); break;
      default: renderUnknown(result.phone); break;
    }
  }

  // ================================================================
  //  ENROLLMENT WIZARD (5 steps)
  // ================================================================
  const WIZARD_STEPS = [
    { id: 'contacto',    label: 'Contacto',    icon: 'user' },
    { id: 'estudiante',  label: 'Estudiante',  icon: 'userPlus' },
    { id: 'inscripcion', label: 'Inscripción', icon: 'book' },
    { id: 'matricula',   label: 'Matrícula',   icon: 'graduation' },
    { id: 'cobro',       label: 'Cobro',       icon: 'dollar' },
  ];

  async function startEnrollmentWizard(phone, existingData) {
    wizardState = {
      step: 0,
      phone: phone || currentPhone,
      prefill: existingData || {},
      results: {}
    };

    if (!catalogsCache) {
      body().innerHTML = `<div class="q10-state"><div class="q10-spinner"></div><div class="q10-state-title">Cargando catálogos...</div></div>`;
      hideActions();
      try {
        catalogsCache = await sendMsg('fetchCatalogs');
      } catch (err) {
        renderError('Error cargando catálogos: ' + err.message);
        return;
      }
    }

    renderWizardStep();
  }

  function wizardStepperHtml(currentStep) {
    return `
      <div class="q10-wizard-stepper">
        ${WIZARD_STEPS.map((s, i) => {
          const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
          return `
            <div class="q10-step ${state}">
              <div class="q10-step-circle">
                ${state === 'done' ? ICONS.check : `<span>${i + 1}</span>`}
              </div>
              <div class="q10-step-label">${s.label}</div>
            </div>
            ${i < WIZARD_STEPS.length - 1 ? '<div class="q10-step-line ' + (i < currentStep ? 'done' : '') + '"></div>' : ''}
          `;
        }).join('')}
      </div>
    `;
  }

  function renderWizardStep() {
    const step = wizardState.step;
    const pf = wizardState.prefill;
    const res = wizardState.results;

    let formHtml = '';

    switch (step) {
      case 0:
        formHtml = `
          <div class="q10-wizard-step-header">
            ${icon('user','q10-wizard-step-icon')}
            <div>
              <div class="q10-wizard-step-title">Paso 1: Crear Contacto</div>
              <div class="q10-wizard-step-desc">Registre los datos básicos del nuevo contacto</div>
            </div>
          </div>
          <div class="q10-form-group"><label class="q10-form-label">Primer Nombre *</label><input class="q10-form-input" id="wz-fname" value="${pf.Primer_nombre||''}" placeholder="Nombre"></div>
          <div class="q10-form-group"><label class="q10-form-label">Segundo Nombre</label><input class="q10-form-input" id="wz-fname2" value="${pf.Segundo_nombre||''}" placeholder="Segundo nombre"></div>
          <div class="q10-form-group"><label class="q10-form-label">Primer Apellido *</label><input class="q10-form-input" id="wz-lname" value="${pf.Primer_apellido||''}" placeholder="Apellido"></div>
          <div class="q10-form-group"><label class="q10-form-label">Segundo Apellido</label><input class="q10-form-input" id="wz-lname2" value="${pf.Segundo_apellido||''}" placeholder="Segundo apellido"></div>
          <div class="q10-form-group"><label class="q10-form-label">Número de Identificación</label><input class="q10-form-input" id="wz-docnum" value="${pf.Numero_identificacion||''}" placeholder="CPF / Cédula / Pasaporte"></div>
          <div class="q10-form-group"><label class="q10-form-label">Email</label><input class="q10-form-input" id="wz-email" type="email" value="${pf.Email||''}" placeholder="email@ejemplo.com"></div>
          <div class="q10-form-group"><label class="q10-form-label">Celular</label><input class="q10-form-input" id="wz-phone" value="${wizardState.phone||''}" placeholder="+502 4512-3489"></div>
        `;
        break;

      case 1:
        formHtml = `
          <div class="q10-wizard-step-header">
            ${icon('userPlus','q10-wizard-step-icon')}
            <div>
              <div class="q10-wizard-step-title">Paso 2: Registrar Estudiante</div>
              <div class="q10-wizard-step-desc">Complete los datos académicos del alumno</div>
            </div>
          </div>
          <div class="q10-info-card" style="margin-bottom:16px;background:#F0FDF4;border-color:#BBF7D0;">
            <div style="font-size:12px;color:#065F46;">✅ Contacto creado: <strong>${fullName(res.contacto)}</strong></div>
          </div>
          <div class="q10-form-group"><label class="q10-form-label">Tipo de Identificación</label>
            <select class="q10-form-select" id="wz-doctype">
              <option value="CC">Cédula de Ciudadanía</option><option value="CE">Cédula de Extranjería</option>
              <option value="TI">Tarjeta de Identidad</option><option value="PA">Pasaporte</option>
              <option value="CPF">CPF</option><option value="Otro">Otro</option>
            </select>
          </div>
          <div class="q10-form-group"><label class="q10-form-label">Fecha de Nacimiento</label><input class="q10-form-input" id="wz-birthdate" type="date"></div>
          <div class="q10-form-group"><label class="q10-form-label">Género</label>
            <select class="q10-form-select" id="wz-gender"><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option><option value="Otro">Otro</option></select>
          </div>
          <div class="q10-form-group"><label class="q10-form-label">Dirección</label><input class="q10-form-input" id="wz-address" placeholder="Dirección completa"></div>
          <div class="q10-form-group"><label class="q10-form-label">Observaciones</label><textarea class="q10-form-textarea" id="wz-est-obs" placeholder="Notas adicionales..."></textarea></div>
        `;
        break;

      case 2:
        {
          const programasOpts = (catalogsCache?.programas || []).map(p => `<option value="${p.Codigo}">${p.Nombre || p.Descripcion || p.Codigo}</option>`).join('');
          const periodosOpts = (catalogsCache?.periodos || []).map(p => `<option value="${p.Codigo}">${p.Nombre || p.Descripcion || p.Codigo}</option>`).join('');
          formHtml = `
            <div class="q10-wizard-step-header">
              ${icon('book','q10-wizard-step-icon')}
              <div>
                <div class="q10-wizard-step-title">Paso 3: Inscribir en Programa</div>
                <div class="q10-wizard-step-desc">Seleccione el programa y periodo académico</div>
              </div>
            </div>
            <div class="q10-info-card" style="margin-bottom:16px;background:#F0FDF4;border-color:#BBF7D0;">
              <div style="font-size:12px;color:#065F46;">✅ Estudiante registrado: <strong>${fullName(res.contacto)}</strong></div>
            </div>
            <div class="q10-form-group"><label class="q10-form-label">Programa *</label>
              <select class="q10-form-select" id="wz-programa"><option value="">— Seleccionar programa —</option>${programasOpts || '<option value="" disabled>No hay programas</option>'}</select>
            </div>
            <div class="q10-form-group"><label class="q10-form-label">Periodo *</label>
              <select class="q10-form-select" id="wz-periodo"><option value="">— Seleccionar periodo —</option>${periodosOpts || '<option value="" disabled>No hay periodos</option>'}</select>
            </div>
            <div class="q10-form-group"><label class="q10-form-label">Jornada</label>
              <select class="q10-form-select" id="wz-jornada"><option value="Diurna">Diurna</option><option value="Nocturna">Nocturna</option><option value="Sabatina">Sabatina</option><option value="Virtual">Virtual</option></select>
            </div>
            <div class="q10-form-group"><label class="q10-form-label">Observaciones</label><textarea class="q10-form-textarea" id="wz-insc-obs" placeholder="Notas..."></textarea></div>
          `;
        }
        break;

      case 3:
        {
          const progName = catalogsCache?.programas?.find(p => p.Codigo === res.inscripcion?.Codigo_programa)?.Nombre || res.inscripcion?.Codigo_programa || '—';
          const perName = catalogsCache?.periodos?.find(p => p.Codigo === res.inscripcion?.Codigo_periodo)?.Nombre || res.inscripcion?.Codigo_periodo || '—';
          formHtml = `
            <div class="q10-wizard-step-header">
              ${icon('graduation','q10-wizard-step-icon')}
              <div>
                <div class="q10-wizard-step-title">Paso 4: Matricular</div>
                <div class="q10-wizard-step-desc">Confirme los datos y efectúe la matrícula</div>
              </div>
            </div>
            <div class="q10-info-card" style="margin-bottom:16px;background:#F0FDF4;border-color:#BBF7D0;">
              <div style="font-size:12px;color:#065F46;">✅ Inscripción realizada</div>
            </div>
            <div class="q10-section">
              <div class="q10-section-title">Resumen de Matrícula</div>
              <div class="q10-info-card">
                <div class="q10-info-row"><span class="q10-info-label">Alumno</span><span class="q10-info-value">${fullName(res.contacto)}</span></div>
                <div class="q10-info-row"><span class="q10-info-label">Programa</span><span class="q10-info-value">${progName}</span></div>
                <div class="q10-info-row"><span class="q10-info-label">Periodo</span><span class="q10-info-value">${perName}</span></div>
              </div>
            </div>
            <div class="q10-form-group"><label class="q10-form-label">Estado de Matrícula</label>
              <select class="q10-form-select" id="wz-mat-estado"><option value="Activo">Activo</option><option value="Provisional">Provisional</option></select>
            </div>
            <div class="q10-form-group"><label class="q10-form-label">Observaciones</label><textarea class="q10-form-textarea" id="wz-mat-obs" placeholder="Notas..."></textarea></div>
          `;
        }
        break;

      case 4:
        formHtml = `
          <div class="q10-wizard-step-header">
            ${icon('dollar','q10-wizard-step-icon')}
            <div>
              <div class="q10-wizard-step-title">Paso 5: Generar Cobro</div>
              <div class="q10-wizard-step-desc">Cree la orden de pago de la matrícula</div>
            </div>
          </div>
          <div class="q10-info-card" style="margin-bottom:16px;background:#F0FDF4;border-color:#BBF7D0;">
            <div style="font-size:12px;color:#065F46;">✅ Matrícula efectuada</div>
          </div>
          <div class="q10-form-group"><label class="q10-form-label">Concepto *</label><input class="q10-form-input" id="wz-cobro-concepto" value="Matrícula" placeholder="Ej: Matrícula, Mensualidad"></div>
          <div class="q10-form-group"><label class="q10-form-label">Valor *</label><input class="q10-form-input" id="wz-cobro-valor" type="number" min="0" step="0.01" placeholder="0.00"></div>
          <div class="q10-form-group"><label class="q10-form-label">Fecha de Vencimiento *</label><input class="q10-form-input" id="wz-cobro-fecha" type="date" value="${new Date(Date.now()+30*86400000).toISOString().split('T')[0]}"></div>
          <div class="q10-form-group"><label class="q10-form-label">Observaciones</label><textarea class="q10-form-textarea" id="wz-cobro-obs" placeholder="Detalles..."></textarea></div>
        `;
        break;
    }

    body().innerHTML = `
      ${wizardStepperHtml(step)}
      <div class="q10-wizard-form">${formHtml}</div>
    `;

    const isFirst = step === 0;
    const isLast = step === WIZARD_STEPS.length - 1;

    showActions(`
      <div style="display:flex;gap:8px;width:100%;">
        ${isFirst
          ? `<button class="q10-btn q10-btn-outline" id="wz-cancel" style="flex:1;">${icon('close','q10-btn-icon')} Cancelar</button>`
          : `<button class="q10-btn q10-btn-outline" id="wz-back" style="flex:0 0 auto;">${icon('arrowLeft','q10-btn-icon')} Anterior</button>`
        }
        <button class="q10-btn ${isLast ? 'q10-btn-cta' : 'q10-btn-primary'}" id="wz-next" style="flex:1;">
          ${isLast ? `${icon('check','q10-btn-icon')} Finalizar` : `Siguiente ${icon('arrowRight','q10-btn-icon')}`}
        </button>
      </div>
    `);

    if (isFirst) {
      document.getElementById('wz-cancel').addEventListener('click', cancelWizard);
    } else {
      document.getElementById('wz-back').addEventListener('click', () => { wizardState.step--; renderWizardStep(); });
    }
    document.getElementById('wz-next').addEventListener('click', submitWizardStep);
  }

  function cancelWizard() {
    wizardState = null;
    if (currentResult) renderResult(currentResult);
    else if (currentPhone) searchPhone(currentPhone);
    else renderNoConversation();
  }

  async function submitWizardStep() {
    const step = wizardState.step;
    const btn = document.getElementById('wz-next');
    const res = wizardState.results;

    btn.disabled = true;
    btn.innerHTML = `<div class="q10-spinner" style="width:18px;height:18px;border-width:2px;"></div> Procesando...`;

    try {
      switch (step) {
        case 0: {
          const fname = document.getElementById('wz-fname').value.trim();
          const lname = document.getElementById('wz-lname').value.trim();
          if (!fname || !lname) throw new Error('Nombre y apellido son obligatorios.');
          const wzEmail = document.getElementById('wz-email').value.trim();
          const wzCelular = document.getElementById('wz-phone').value.trim();
          if (!wzEmail && !wzCelular) throw new Error('Informe email ou celular (ao menos um).');
          const wzDetalle = [];
          if (wzEmail) wzDetalle.push({ Tipo_detalle: 'Email', Descripcion: wzEmail });
          if (wzCelular) wzDetalle.push({ Tipo_detalle: 'Telefono', Descripcion: wzCelular });
          const payload = {
            Consecutivo_oportunidad: 0,
            Nombres: [fname, document.getElementById('wz-fname2').value.trim()].filter(Boolean).join(' '),
            Apellidos: [lname, document.getElementById('wz-lname2').value.trim()].filter(Boolean).join(' '),
            Detalle: wzDetalle,
          };
          const result = await sendMsg('createContacto', { body: payload });
          res.contacto = { ...payload, ...result };
          showToast('Contacto creado ✓', 'success');
          break;
        }
        case 1: {
          const payload = {
            Codigo_contacto: res.contacto.Codigo,
            Primer_nombre: res.contacto.Primer_nombre, Segundo_nombre: res.contacto.Segundo_nombre,
            Primer_apellido: res.contacto.Primer_apellido, Segundo_apellido: res.contacto.Segundo_apellido,
            Numero_identificacion: res.contacto.Numero_identificacion,
            Tipo_identificacion: document.getElementById('wz-doctype').value,
            Email: res.contacto.Email, Celular: res.contacto.Celular,
            Fecha_nacimiento: document.getElementById('wz-birthdate').value || null,
            Genero: document.getElementById('wz-gender').value,
            Direccion: document.getElementById('wz-address').value.trim(),
            Observaciones: document.getElementById('wz-est-obs').value.trim(),
          };
          const result = await sendMsg('createEstudiante', { body: payload });
          res.estudiante = { ...payload, ...result };
          showToast('Estudiante registrado ✓', 'success');
          break;
        }
        case 2: {
          const programa = document.getElementById('wz-programa').value;
          const periodo = document.getElementById('wz-periodo').value;
          if (!programa || !periodo) throw new Error('Seleccione programa y periodo.');
          const payload = {
            Codigo_estudiante: res.estudiante.Codigo, Codigo_programa: programa,
            Codigo_periodo: periodo, Jornada: document.getElementById('wz-jornada').value,
            Observaciones: document.getElementById('wz-insc-obs').value.trim(),
          };
          const result = await sendMsg('createInscripcion', { body: payload });
          res.inscripcion = { ...payload, ...result };
          showToast('Inscripción realizada ✓', 'success');
          break;
        }
        case 3: {
          const payload = {
            Codigo_estudiante: res.estudiante.Codigo,
            Codigo_programa: res.inscripcion.Codigo_programa,
            Codigo_periodo: res.inscripcion.Codigo_periodo,
            Estado: document.getElementById('wz-mat-estado').value,
            Observaciones: document.getElementById('wz-mat-obs').value.trim(),
          };
          const result = await sendMsg('createMatricula', { body: payload });
          res.matricula = { ...payload, ...result };
          showToast('Matrícula efectuada ✓', 'success');
          break;
        }
        case 4: {
          const concepto = document.getElementById('wz-cobro-concepto').value.trim();
          const valor = document.getElementById('wz-cobro-valor').value;
          const fecha = document.getElementById('wz-cobro-fecha').value;
          if (!concepto || !valor || !fecha) throw new Error('Concepto, valor y fecha son obligatorios.');
          const payload = {
            Codigo_estudiante: res.estudiante.Codigo, Concepto: concepto,
            Valor: parseFloat(valor), Fecha_vencimiento: fecha,
            Observaciones: document.getElementById('wz-cobro-obs').value.trim(),
          };
          const result = await sendMsg('createOrdenPago', { body: payload });
          res.cobro = { ...payload, ...result };
          showToast('Orden de pago generada ✓', 'success');
          renderWizardComplete();
          return;
        }
      }
      wizardState.step++;
      renderWizardStep();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      const isLast = step === WIZARD_STEPS.length - 1;
      btn.innerHTML = isLast ? `${icon('check','q10-btn-icon')} Finalizar` : `Siguiente ${icon('arrowRight','q10-btn-icon')}`;
    }
  }

  function renderWizardComplete() {
    const res = wizardState.results;
    const progName = catalogsCache?.programas?.find(p => p.Codigo === res.inscripcion?.Codigo_programa)?.Nombre || '—';

    body().innerHTML = `
      ${wizardStepperHtml(5)}
      <div class="q10-state" style="padding:24px 16px;">
        <div style="width:64px;height:64px;background:#D1FAE5;border-radius:50%;display:flex;align-items:center;justify-content:center;">
          <span style="color:#065F46;width:32px;height:32px;">${ICONS.check}</span>
        </div>
        <div class="q10-state-title" style="color:#065F46;">¡Matrícula Completa!</div>
        <div class="q10-state-text">El proceso de matrícula se completó exitosamente.</div>
      </div>
      <div class="q10-section">
        <div class="q10-section-title">Resumen</div>
        <div class="q10-info-card">
          <div class="q10-info-row"><span class="q10-info-label">Alumno</span><span class="q10-info-value">${fullName(res.contacto)}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Programa</span><span class="q10-info-value">${progName}</span></div>
          <div class="q10-info-row"><span class="q10-info-label">Estado</span><span class="q10-info-value"><span class="q10-badge q10-badge-green">${res.matricula?.Estado||'Activo'}</span></span></div>
          ${res.cobro ? `<div class="q10-info-row"><span class="q10-info-label">Cobro</span><span class="q10-info-value">${fmtMoney(res.cobro.Valor)}</span></div>` : ''}
        </div>
      </div>
    `;

    showActions(`
      <button class="q10-btn q10-btn-primary" id="wz-finish" style="flex:1;">${icon('search','q10-btn-icon')} Ver Alumno</button>
      <button class="q10-btn q10-btn-outline" id="wz-new" style="flex:1;">${icon('plus','q10-btn-icon')} Nueva Matrícula</button>
    `);

    document.getElementById('wz-finish').addEventListener('click', () => {
      wizardState = null;
      sendMsg('clearCache');
      if (currentPhone) searchPhone(currentPhone);
    });
    document.getElementById('wz-new').addEventListener('click', () => {
      const phone = wizardState.phone;
      wizardState = null;
      startEnrollmentWizard(phone);
    });
  }

  // ================================================================
  //  MODALS
  // ================================================================
  function removeModal() {
    const existing = document.querySelector('.q10-modal-overlay');
    if (existing) existing.remove();
  }

  function showGenerarCobroModal(studentData) {
    removeModal();
    const overlay = el('div', 'q10-modal-overlay');
    overlay.innerHTML = `
      <div class="q10-modal">
        <div class="q10-modal-header">
          <span class="q10-modal-title">${icon('dollar','q10-btn-icon')} Generar Cobro</span>
          <button class="q10-modal-close-btn">${ICONS.close}</button>
        </div>
        <div class="q10-modal-body">
          <div class="q10-info-card" style="margin-bottom:14px;background:#F0F9FF;border-color:#BAE6FD;">
            <div style="font-size:12px;color:#0369A1;">Alumno: <strong>${fullName(studentData)}</strong></div>
          </div>
          <div class="q10-form-group"><label class="q10-form-label">Concepto *</label><input class="q10-form-input" id="q10-cobro-concepto" placeholder="Ej: Mensualidad, Material"></div>
          <div class="q10-form-group"><label class="q10-form-label">Valor *</label><input class="q10-form-input" id="q10-cobro-valor" type="number" min="0" step="0.01" placeholder="0.00"></div>
          <div class="q10-form-group"><label class="q10-form-label">Fecha de Vencimiento *</label><input class="q10-form-input" id="q10-cobro-fecha" type="date" value="${new Date(Date.now()+30*86400000).toISOString().split('T')[0]}"></div>
          <div class="q10-form-group"><label class="q10-form-label">Observaciones</label><textarea class="q10-form-textarea" id="q10-cobro-obs" placeholder="Notas..."></textarea></div>
        </div>
        <div class="q10-modal-footer">
          <button class="q10-btn q10-btn-outline q10-modal-cancel">Cancelar</button>
          <button class="q10-btn q10-btn-cta" id="q10-cobro-submit">${icon('dollar','q10-btn-icon')} Generar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.q10-modal-close-btn').addEventListener('click', removeModal);
    overlay.querySelector('.q10-modal-cancel').addEventListener('click', removeModal);

    document.getElementById('q10-cobro-submit').addEventListener('click', async () => {
      const concepto = document.getElementById('q10-cobro-concepto').value.trim();
      const valor = document.getElementById('q10-cobro-valor').value;
      const fecha = document.getElementById('q10-cobro-fecha').value;
      if (!concepto || !valor || !fecha) { showToast('Concepto, valor y fecha obligatorios', 'error'); return; }
      const btn = document.getElementById('q10-cobro-submit');
      btn.disabled = true; btn.innerHTML = `<div class="q10-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;"></div> Generando...`;
      try {
        await sendMsg('createOrdenPago', { body: { Codigo_estudiante: studentData.Codigo, Concepto: concepto, Valor: parseFloat(valor), Fecha_vencimiento: fecha, Observaciones: document.getElementById('q10-cobro-obs').value.trim() } });
        showToast('Cobro generado ✓', 'success');
        removeModal();
        refreshFinancials(studentData);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.innerHTML = `${icon('dollar','q10-btn-icon')} Generar`;
      }
    });
  }

  function showCreateOportunidadModal(phone, detectedName = null, contactData) {
    removeModal();
    const overlay = el('div', 'q10-modal-overlay');
    overlay.innerHTML = `
      <div class="q10-modal">
        <div class="q10-modal-header">
          <span class="q10-modal-title">Crear Oportunidad</span>
          <button class="q10-modal-close-btn">${ICONS.close}</button>
        </div>
        <div class="q10-modal-body">
          <div class="q10-form-group"><label class="q10-form-label">Primer Nombre *</label><input class="q10-form-input" id="q10-op-fname" value="${contactData?.Primer_nombre||''}" placeholder="Nombre"></div>
          <div class="q10-form-group"><label class="q10-form-label">Primer Apellido *</label><input class="q10-form-input" id="q10-op-lname" value="${contactData?.Primer_apellido||''}" placeholder="Apellido"></div>
          <div class="q10-form-group"><label class="q10-form-label">Email</label><input class="q10-form-input" id="q10-op-email" type="email" value="${contactData?.Email||''}" placeholder="email@ejemplo.com"></div>
          <div class="q10-form-group"><label class="q10-form-label">Celular</label><input class="q10-form-input" id="q10-op-phone" value="${phone||''}" placeholder="+502 4512-3489"></div>
          <div class="q10-form-group"><label class="q10-form-label">Observaciones</label><textarea class="q10-form-textarea" id="q10-op-obs" placeholder="Notas..."></textarea></div>
        </div>
        <div class="q10-modal-footer">
          <button class="q10-btn q10-btn-outline q10-modal-cancel">Cancelar</button>
          <button class="q10-btn q10-btn-cta" id="q10-op-submit">Crear</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.q10-modal-close-btn').addEventListener('click', removeModal);
    overlay.querySelector('.q10-modal-cancel').addEventListener('click', removeModal);

    document.getElementById('q10-op-submit').addEventListener('click', async () => {
      const fname = document.getElementById('q10-op-fname').value.trim();
      const lname = document.getElementById('q10-op-lname').value.trim();
      if (!fname || !lname) { showToast('Nombre y apellido obligatorios', 'error'); return; }
      const btn = document.getElementById('q10-op-submit');
      btn.disabled = true; btn.textContent = 'Creando...';
      try {
        await sendMsg('createOportunidad', { body: { Primer_nombre: fname, Primer_apellido: lname, Email: document.getElementById('q10-op-email').value.trim(), Celular: document.getElementById('q10-op-phone').value.trim(), Observaciones: document.getElementById('q10-op-obs').value.trim() } });
        showToast('Oportunidad creada ✓', 'success');
        removeModal();
        sendMsg('clearCache').catch(() => {});
        if (currentPhone) searchPhone(currentPhone);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Crear';
      }
    });
  }

  function showCreateContactoModal(phone, detectedName = null) {
    if (!detectedName) detectedName = currentContactName;
    removeModal();
    const overlay = el('div', 'q10-modal-overlay');
    overlay.innerHTML = `
      <div class="q10-modal q10-modal-wide">
        <div class="q10-modal-header">
          <span class="q10-modal-title">Registrar Contacto</span>
          <button class="q10-modal-close-btn">${ICONS.close}</button>
        </div>
        <div class="q10-modal-body">
          <div class="q10-form-row">
            <div class="q10-form-group"><label class="q10-form-label">Nombres *</label><input class="q10-form-input" id="q10-ct-fname" value="${detectedName ? detectedName.split(' ').slice(0,2).join(' ') : ''}" placeholder="Primer y segundo nombre"></div>
            <div class="q10-form-group"><label class="q10-form-label">Apellidos *</label><input class="q10-form-input" id="q10-ct-lname" value="${detectedName && detectedName.split(' ').length > 1 ? detectedName.split(' ').slice(1).join(' ') : ''}" placeholder="Apellidos"></div>
          </div>
          <div class="q10-form-row">
            <div class="q10-form-group"><label class="q10-form-label">Celular</label><input class="q10-form-input" id="q10-ct-phone" value="${phone||''}" placeholder="+55 11 99999-9999"></div>
            <div class="q10-form-group"><label class="q10-form-label">Email</label><input class="q10-form-input" id="q10-ct-email" type="email" placeholder="email@ejemplo.com"></div>
          </div>
          <p style="font-size:11px;color:#6B7280;margin:0 0 4px">* Informe ao menos celular ou email</p>
        </div>
        <div class="q10-modal-footer">
          <button class="q10-btn q10-btn-outline q10-modal-cancel">Cancelar</button>
          <button class="q10-btn q10-btn-primary" id="q10-ct-submit">Registrar Contacto</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.q10-modal-close-btn').addEventListener('click', removeModal);
    overlay.querySelector('.q10-modal-cancel').addEventListener('click', removeModal);

    // Form validation helper
    function markError(id, msg) {
      const el = document.getElementById(id);
      if (el) { el.style.borderColor = '#EF4444'; el.focus(); }
      showToast(msg, 'error');
    }
    function clearErrors() {
      ['q10-ct-fname','q10-ct-lname','q10-ct-email','q10-ct-phone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.borderColor = '';
      });
    }

    document.getElementById('q10-ct-submit').addEventListener('click', async () => {
      clearErrors();
      const fname = document.getElementById('q10-ct-fname').value.trim();
      const lname = document.getElementById('q10-ct-lname').value.trim();
      const email   = document.getElementById('q10-ct-email').value.trim();
      const celular = document.getElementById('q10-ct-phone').value.trim();

      if (!fname) { markError('q10-ct-fname', 'Informe os Nombres'); return; }
      if (!lname) { markError('q10-ct-lname', 'Informe os Apellidos'); return; }
      if (!email && !celular) { markError('q10-ct-phone', 'Informe ao menos celular ou email'); markError('q10-ct-email', 'Informe ao menos celular ou email'); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { markError('q10-ct-email', 'Email inválido'); return; }

      const btn = document.getElementById('q10-ct-submit');
      btn.disabled = true; btn.textContent = 'Registrando...';

      try {
        // Build Detalle array — Q10 only accepts "Celular" or "Email"
        const detalle = [];
        if (celular) detalle.push({ Tipo_detalle: 'Celular', Descripcion: celular });
        if (email)   detalle.push({ Tipo_detalle: 'Email',   Descripcion: email });

        await sendMsg('createContacto', { body: {
          Consecutivo_oportunidad: 0,
          Nombres: fname,
          Apellidos: lname,
          Detalle: detalle
        }});

        showToast('Contacto registrado ✓', 'success');
        removeModal();
        sendMsg('clearCache').catch(() => {});
        if (currentPhone) searchPhone(currentPhone);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Registrar Contacto';
      }
    });
  }

  function showCreateActividadModal(contactData) {
    removeModal();
    const overlay = el('div', 'q10-modal-overlay');
    overlay.innerHTML = `
      <div class="q10-modal">
        <div class="q10-modal-header">
          <span class="q10-modal-title">Registrar Actividad</span>
          <button class="q10-modal-close-btn">${ICONS.close}</button>
        </div>
        <div class="q10-modal-body">
          <div class="q10-form-group"><label class="q10-form-label">Tipo *</label>
            <select class="q10-form-select" id="q10-act-type">
              <option value="Llamada">Llamada</option><option value="WhatsApp" selected>WhatsApp</option>
              <option value="Email">Email</option><option value="Reunión">Reunión</option><option value="Otro">Otro</option>
            </select>
          </div>
          <div class="q10-form-group"><label class="q10-form-label">Descripción *</label><textarea class="q10-form-textarea" id="q10-act-desc" placeholder="Detalle de la interacción..."></textarea></div>
        </div>
        <div class="q10-modal-footer">
          <button class="q10-btn q10-btn-outline q10-modal-cancel">Cancelar</button>
          <button class="q10-btn q10-btn-success" id="q10-act-submit">Registrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.q10-modal-close-btn').addEventListener('click', removeModal);
    overlay.querySelector('.q10-modal-cancel').addEventListener('click', removeModal);

    document.getElementById('q10-act-submit').addEventListener('click', async () => {
      const desc = document.getElementById('q10-act-desc').value.trim();
      if (!desc) { showToast('Descripción obligatoria', 'error'); return; }
      const btn = document.getElementById('q10-act-submit');
      btn.disabled = true; btn.textContent = 'Registrando...';
      try {
        await sendMsg('createActividad', { body: { Tipo: document.getElementById('q10-act-type').value, Descripcion: desc, Fecha: new Date().toISOString(), Codigo_oportunidad: contactData?.Codigo || null, Observaciones: `Contacto: ${fullName(contactData)} | WhatsApp` } });
        showToast('Actividad registrada ✓', 'success');
        removeModal();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Registrar';
      }
    });
  }

  // ================================================================
  //  SEARCH
  // ================================================================
  function searchPhone(phone) {
    if (!phone) return;
    currentPhone = phone;
    renderLoading();

    chrome.runtime.sendMessage({ action: 'searchPhone', phone }, (resp) => {
      if (chrome.runtime.lastError) { renderError('Erro de comunicação. Recarregue a extensão.'); return; }
      if (!resp || !resp.ok) { renderError(resp?.error || 'Erro desconhecido.'); return; }
      renderResult(resp.data);
    });
  }

  // ================================================================
  //  LISTEN FOR PHONE CHANGES (via storage)
  // ================================================================
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session') return;
    if (wizardState) return; // Don't interrupt wizard
    
    if (changes.currentPhone) {
      const newPhone = changes.currentPhone.newValue;
      // Also grab name if it came in same event
      if (changes.currentContactName?.newValue) currentContactName = changes.currentContactName.newValue;
      if (newPhone && newPhone !== currentPhone) {
        chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
          if (resp && resp.ok && resp.data?.configured) {
            searchPhone(newPhone);
          } else {
            renderNoApiKey();
          }
        });
      } else if (!newPhone && !changes.currentContactName) {
        currentPhone = null;
        renderNoConversation();
      }
    }
    
    if (changes.currentContactName) {
      const newName = changes.currentContactName.newValue;
      // Also capture phone if it arrived in the same change event
      const phoneFromChange = changes.currentPhone?.newValue || null;
      if (phoneFromChange) currentPhone = phoneFromChange;
      currentContactName = newName;
      if (newName) {
        chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
          if (resp && resp.ok && resp.data?.configured) {
            // If we have a phone, search by phone first (more accurate)
            if (currentPhone) {
              renderLoading('Buscando: ' + currentPhone + '...');
              searchPhone(currentPhone);
              return;
            }
            renderLoading('Buscando: ' + newName + '...');
            chrome.runtime.sendMessage({ action: 'searchName', name: newName }, (searchResp) => {
              if (searchResp && searchResp.ok) {
                currentResult = searchResp.data;
                currentPhone = searchResp.data?.phone || currentPhone || null;
                if (searchResp.data.type === 'unknown') {
                  renderUnknown(newName);
                } else if (searchResp.data.type === 'estudiante') {
                  renderEstudiante(searchResp.data);
                } else if (searchResp.data.type === 'contacto') {
                  renderContacto(searchResp.data);
                } else if (searchResp.data.type === 'oportunidad') {
                  renderOportunidad(searchResp.data);
                }
              } else {
                renderUnknown(newName);
              }
            });
          }
        });
      } else if (!changes.currentPhone) {
        renderNoConversation();
      }
    }
  });

  // ================================================================
  //  INIT
  // ================================================================
  function init() {
    // Check API key first
    chrome.runtime.sendMessage({ action: 'checkApiKey' }, (resp) => {
      if (!resp || !resp.ok || !resp.data?.configured) {
        renderNoApiKey();
        return;
      }

      // Check if there's already a detected phone
      chrome.storage.session.get(['currentPhone', 'currentContactName'], (result) => {
        if (result.currentPhone) {
          searchPhone(result.currentPhone);
        } else if (result.currentContactName) {
          renderLoading('Buscando: ' + result.currentContactName + '...');
          chrome.runtime.sendMessage({ action: 'searchName', name: result.currentContactName }, (searchResp) => {
            if (searchResp && searchResp.ok && searchResp.data.type !== 'unknown') {
              currentResult = searchResp.data;
              if (searchResp.data.type === 'estudiante') renderEstudiante(searchResp.data);
              else if (searchResp.data.type === 'contacto') renderContacto(searchResp.data);
              else if (searchResp.data.type === 'oportunidad') renderOportunidad(searchResp.data);
            } else {
              renderUnknown(result.currentContactName);
            }
          });
        } else {
          renderNoConversation();
        }
      });
    });

    console.log('[Q10 CRM] Side panel loaded (v3.0)');
  }

  init();

})();
