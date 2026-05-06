/* ============================================================
   Q10 CRM — Handlers Module
   Event binding functions. All DOM event listeners live here.
   ============================================================ */

import { sendMsg } from './q10Api.js';
import {
  body, hideActions, showActions, phoneHtml,
  renderLoading, renderNoConversation, renderError,
  renderUnknown, renderEstudiante, renderContacto, renderOportunidad,
  renderTagsSection, renderNotesSection, attachTagsAndNotes,
  generateCSV, downloadCSV
} from './renderer.js';
import {
  icon, htmlText, htmlAttr, fullNameHtml, fullName, fmtMoney,
  el, escHtml, normalizeWizardPrefill
} from './helpers.js';
import {
  currentPhone, currentContactName, currentResult, wizardState, catalogsCache,
  setCurrentPhone, setCurrentResult, setWizardState, setCatalogsCache,
  getContactTags, setContactTags, getContactNotes, addContactNote, deleteContactNote
} from './state.js';

// ================================================================
//  SEARCH TOKEN — invalida callbacks de buscas obsoletas
//  Usuário trocando de conversa rápido dispara várias buscas em paralelo;
//  sem token, o callback que chega por último (não necessariamente da
//  conversa atual) sobrescreve a renderização — info "não atualiza"
//  porque o resultado da conversa anterior é o último a renderizar.
// ================================================================
let _searchToken = 0;
function nextSearchToken() { return ++_searchToken; }
function isStaleToken(t) { return t !== _searchToken; }

// ================================================================
//  TOAST & MODAL primitives
// ================================================================
export function showToast(text, type = '') {
  const existing = document.querySelector('.q10-toast');
  if (existing) existing.remove();
  const t = el('div', `q10-toast ${type ? 'q10-toast-' + type : ''}`);
  t.textContent = text || '';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

export function removeModal() {
  const existing = document.querySelector('.q10-modal-overlay');
  if (existing) existing.remove();
}

// ================================================================
//  EXPORT handlers
// ================================================================
export function exportAllData() {
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

export function exportConversation() {
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

export function bindExportButtons() {
  document.getElementById('q10-export-data')?.addEventListener('click', exportAllData);
  document.getElementById('q10-export-chat')?.addEventListener('click', exportConversation);
}

// ================================================================
//  RENDER + BIND dispatch
//  renderer.js só pinta DOM (por design — comentário no topo do arquivo).
//  Os bindXActions abaixo precisam ser chamados após cada render senão
//  os botões "Crear Oportunidad", "Matricular Alumno", "Registrar Actividad"
//  ficam sem listener — clique não dispara nada. Use este helper em todo
//  call site que renderiza um resultado de busca.
// ================================================================
export function renderResult(result, phone, name) {
  const data = (result && result.data) || null;
  const type = result && result.type;
  if (type === 'estudiante') {
    renderEstudiante(result);
    bindEstudianteActions(data || result);
  } else if (type === 'contacto') {
    renderContacto(data || result);
    bindContactoActions(data || result);
  } else if (type === 'oportunidad') {
    renderOportunidad(result);
    bindOportunidadActions(data || result);
  } else {
    renderUnknown(phone || name);
    bindUnknownActions(phone || null, name || null);
  }
}

// ================================================================
//  RESTORE VIEW helper
// ================================================================
export function restoreView() {
  if (currentResult) {
    renderResult(currentResult, currentPhone, currentContactName);
  } else if (currentPhone) {
    searchPhone(currentPhone);
  } else {
    renderNoConversation();
  }
}

// ================================================================
//  TAGS handlers
// ================================================================
export function bindTagsHandlers() {
  document.querySelectorAll('.q10-tag').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tagId = btn.dataset.tag;
      const contactId = btn.dataset.contact;
      let tags = await getContactTags(contactId);
      if (tags.includes(tagId)) tags = tags.filter(t => t !== tagId);
      else tags.push(tagId);
      await setContactTags(contactId, tags);
      btn.classList.toggle('q10-tag-active');
    });
  });
}

// ================================================================
//  NOTES handlers
// ================================================================
export function bindNotesHandlers(contactId) {
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

// ================================================================
//  MANUAL SEARCH (empty state)
// ================================================================
export function bindManualSearch() {
  const input = document.getElementById('q10-manual-input');
  const btn = document.getElementById('q10-manual-btn');
  if (!input || !btn) return;

  btn.addEventListener('click', () => {
    const value = input.value.trim();
    if (!value) return;
    const isPhone = /^\+?\d[\d\s\-]{7,}$/.test(value.replace(/[\s\-]/g, ''));
    if (isPhone) {
      searchPhone(value.replace(/[\s\-\(\)]/g, ''));
    } else {
      searchName(value);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });
}

// ================================================================
//  RETRY handler
// ================================================================
export function bindRetryHandler() {
  document.getElementById('q10-retry')?.addEventListener('click', () => {
    if (currentPhone) searchPhone(currentPhone);
  });
}

// ================================================================
//  SEARCH
// ================================================================
export function searchPhone(phone) {
  if (!phone) return;
  setCurrentPhone(phone);
  renderLoading();
  const myToken = nextSearchToken();

  chrome.runtime.sendMessage({ action: 'searchPhone', phone }, (resp) => {
    if (isStaleToken(myToken)) return;
    if (chrome.runtime.lastError) { renderError('Erro de comunicação. Recarregue a extensão.'); return; }
    if (!resp || !resp.ok) { renderError(resp?.error || 'Erro desconhecido.'); return; }
    setCurrentResult(resp.data);
    renderResult(resp.data, currentPhone, currentContactName);
  });
}

// ================================================================
//  searchName — usado por sidepanel.js (storage listener / init)
//  e pelo input de busca manual. Mesma proteção de token.
// ================================================================
export function searchName(name, fallbackPhone) {
  if (!name) return;
  renderLoading('Buscando: ' + name + '...');
  const myToken = nextSearchToken();

  chrome.runtime.sendMessage({ action: 'searchName', name }, (resp) => {
    if (isStaleToken(myToken)) return;
    if (chrome.runtime.lastError) { renderError('Erro de comunicação. Recarregue a extensão.'); return; }
    if (resp && resp.ok) {
      setCurrentResult(resp.data);
      renderResult(resp.data, fallbackPhone || null, name);
    } else {
      renderResult(null, fallbackPhone || null, name);
    }
  });
}

// ================================================================
//  REFRESH FINANCIALS
// ================================================================
export function refreshFinancials(studentData) {
  const btn = document.getElementById('q10-refresh-fin');
  if (btn) { btn.disabled = true; btn.innerHTML = `${icon('refresh','q10-btn-icon')} Cargando...`; }
  sendMsg('fetchStudentFinancials', { codigoEstudiante: studentData.Codigo }).then(fin => {
    if (currentResult && currentResult.type === 'estudiante') {
      currentResult.estadoCuenta = fin.estadoCuenta;
      currentResult.pagosPendientes = fin.pagosPendientes;
      renderEstudiante(currentResult);
      showToast('Datos financieros actualizados', 'success');
    }
  }).catch(err => {
    showToast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `${icon('refresh','q10-btn-icon')} Actualizar Financiero`; }
  });
}

// ================================================================
//  MODALS
// ================================================================
export function showGenerarCobroModal(studentData) {
  removeModal();
  const overlay = el('div', 'q10-modal-overlay');
  overlay.innerHTML = `
    <div class="q10-modal">
      <div class="q10-modal-header">
        <span class="q10-modal-title">${icon('dollar','q10-btn-icon')} Generar Cobro</span>
        <button class="q10-modal-close-btn">${icon('close')}</button>
      </div>
      <div class="q10-modal-body">
        <div class="q10-info-card" style="margin-bottom:14px;background:#F0F9FF;border-color:#BAE6FD;">
          <div style="font-size:12px;color:#0369A1;">Alumno: <strong>${fullNameHtml(studentData)}</strong></div>
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

// Page-based replacement for the previous modal. Renders into the main body
// like the matriculation wizard, which gives the WhatsApp lidPnCache time
// to populate while we async-fetch medios + asesor — fixing the case where
// the LID→phone mapping wasn't ready at click-time and the modal opened
// with phone empty.
export function showCreateOportunidadModal(phone, detectedName = null, contactData = null) {
  removeModal(); // close any leftover modal from older flows

  body().innerHTML = `
    <div class="q10-state">
      <div class="q10-spinner"></div>
      <div class="q10-state-title">Cargando datos...</div>
    </div>
  `;
  hideActions();

  // Wait for medios + asesor in parallel. The await also gives WA's
  // lidPnCache 200-600ms to settle, which is usually enough to resolve
  // the chat's phone if it just got opened.
  Promise.all([
    sendMsg('fetchMedios').catch(() => ({ mediospublicitarios: [], medioscontacto: [] })),
    sendMsg('getAsesor').catch(() => ({ asesorId: null })),
    sendMsg('fetchAdministrativos').catch(() => ({ data: [] })),
  ]).then(([mediosData, asesorResp, adminResp]) => {
    // Re-derive phone now that resolution had time to happen.
    const detalleCelular = (contactData?.Detalle || []).find(d => d.Tipo_detalle === 'Celular')?.Descripcion;
    const prefillPhone = String(
      contactData?.Celular ||
      contactData?.Telefono ||
      detalleCelular ||
      currentPhone ||
      phone ||
      ''
    ).replace(/\D/g, '');

    const detalleEmail = (contactData?.Detalle || []).find(d => d.Tipo_detalle === 'Email')?.Descripcion;
    const prefillEmail = contactData?.Email || contactData?.Correo_electronico || detalleEmail || '';

    const prefillName = detectedName || (contactData
      ? [contactData.Nombres || contactData.Primer_nombre, contactData.Apellidos || contactData.Primer_apellido].filter(Boolean).join(' ')
      : (currentContactName || ''));

    const optHtml = (id, name) => `<option value="${htmlAttr(id)}">${htmlText(name)}</option>`;
    const mediosPub = (mediosData.mediospublicitarios || []).map(m => {
      const id = m.Consecutivo_medio_publicitario ?? m.Consecutivo;
      const name = m.Nombre_medio_publicitario || m.Nombre || m.Descripcion || id;
      return optHtml(id, name);
    }).join('');
    const mediosCtc = (mediosData.medioscontacto || []).map(m => {
      const id = m.Consecutivo_medio_contacto ?? m.Consecutivo;
      const name = m.Nombre_medio_contacto || m.Nombre || m.Descripcion || id;
      return optHtml(id, name);
    }).join('');

    let asesorLabel = 'Carregando...';
    let asesorWarning = false;
    const asesorId = asesorResp?.asesorId;
    if (!asesorId) {
      asesorLabel = '⚠️ No configurado — abre las Opciones de la extensión';
      asesorWarning = true;
    } else {
      const list = Array.isArray(adminResp) ? adminResp : (adminResp?.data || []);
      const match = list.find(a => a.Numero_identificacion === asesorId);
      const fullName = match
        ? [match.Primer_nombre, match.Segundo_nombre, match.Primer_apellido, match.Segundo_apellido].filter(Boolean).join(' ').trim()
        : '';
      asesorLabel = fullName ? `${fullName} (${asesorId})` : asesorId;
    }

    body().innerHTML = `
      <div style="padding:14px 16px 8px;">
        <button id="q10-op-back" class="q10-btn q10-btn-outline" style="display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 10px;">
          ${icon('arrowLeft','q10-btn-icon')} Voltar
        </button>
      </div>
      <div class="q10-wizard-form" style="padding:0 16px 16px;">
        <div class="q10-wizard-step-header">
          ${icon('briefcase','q10-wizard-step-icon')}
          <div>
            <div class="q10-wizard-step-title">Registrar Lead / Oportunidad</div>
            <div class="q10-wizard-step-desc">Datos del prospecto que vamos a crear en el CRM Q10</div>
          </div>
        </div>

        <div class="q10-form-group">
          <label class="q10-form-label">Identificación *</label>
          <input class="q10-form-input" id="q10-op-ident" value="${htmlAttr(prefillName)}" placeholder="Nome do lead (ex.: João Silva)">
          <p style="font-size:11px;color:#6B7280;margin:4px 0 0">Aceita nome ou documento. Vai virar o título da oportunidade no Q10.</p>
        </div>

        <div class="q10-form-row">
          <div class="q10-form-group"><label class="q10-form-label">Correo electrónico</label><input class="q10-form-input" id="q10-op-email" type="email" value="${htmlAttr(prefillEmail)}" placeholder="email@ejemplo.com"></div>
          <div class="q10-form-group"><label class="q10-form-label">Celular</label><input class="q10-form-input" id="q10-op-phone" value="${htmlAttr(prefillPhone)}" placeholder="${htmlAttr(prefillPhone || '50686906161')}"></div>
        </div>

        <div class="q10-form-row">
          <div class="q10-form-group"><label class="q10-form-label">Teléfono</label><input class="q10-form-input" id="q10-op-tel" placeholder="Telefone fixo (opcional)"></div>
          <div class="q10-form-group"><label class="q10-form-label">Dirección</label><input class="q10-form-input" id="q10-op-addr" placeholder="Endereço (opcional)"></div>
        </div>

        <div class="q10-form-row">
          <div class="q10-form-group"><label class="q10-form-label">Municipio</label><input class="q10-form-input" id="q10-op-muni" placeholder="Município (opcional)"></div>
          <div class="q10-form-group"><label class="q10-form-label">Distrito</label><input class="q10-form-input" id="q10-op-dist" placeholder="Distrito (opcional)"></div>
        </div>

        <div class="q10-form-group">
          <label class="q10-form-label">Asesor</label>
          <input class="q10-form-input" id="q10-op-asesor" disabled value="${htmlAttr(asesorLabel)}" style="background:#F3F4F6;color:${asesorWarning ? '#B91C1C' : '#374151'};">
          <p style="font-size:11px;color:#6B7280;margin:4px 0 0">Configurado nas Opções da extensão.</p>
        </div>

        <div class="q10-form-group">
          <label class="q10-form-label">¿Cómo se enteró? *</label>
          <select class="q10-form-select" id="q10-op-medio-pub">
            <option value="">— Selecciona —</option>
            ${mediosPub || '<option value="" disabled>No hay medios disponibles</option>'}
          </select>
        </div>

        <div class="q10-form-row">
          <div class="q10-form-group">
            <label class="q10-form-label">Medio de contacto</label>
            <select class="q10-form-select" id="q10-op-medio-ctc">
              <option value="">— Selecciona —</option>
              ${mediosCtc || '<option value="" disabled>No hay medios disponibles</option>'}
            </select>
          </div>
          <div class="q10-form-group">
            <label class="q10-form-label">¿Ha estudiado anteriormente Portugues?</label>
            <select class="q10-form-select" id="q10-op-cf-portugues">
              <option value="">— Não informado —</option>
              <option value="Sí">Sí</option>
              <option value="No">No</option>
            </select>
          </div>
        </div>

        <p style="font-size:11px;color:#6B7280;margin:0">* Campos obrigatórios</p>
      </div>
    `;

    // Pre-select WhatsApp as the contact medium when the option exists.
    const ctcSel = document.getElementById('q10-op-medio-ctc');
    if (ctcSel) {
      Array.from(ctcSel.options).forEach(opt => {
        if (opt.text.toLowerCase().includes('whatsapp')) ctcSel.value = opt.value;
      });
    }

    showActions(`
      <button class="q10-btn q10-btn-cta" id="q10-op-submit" style="flex:1;">
        ${icon('check','q10-btn-icon')} Registrar Lead
      </button>
    `);

    document.getElementById('q10-op-back').addEventListener('click', () => restoreView());

    document.getElementById('q10-op-submit').addEventListener('click', async () => {
      const ident = document.getElementById('q10-op-ident').value.trim();
      const medioPub = document.getElementById('q10-op-medio-pub').value;
      if (!ident) { showToast('Identificación é obrigatória', 'error'); document.getElementById('q10-op-ident').style.borderColor = '#EF4444'; return; }
      if (!medioPub) { showToast('¿Cómo se enteró? é obrigatório', 'error'); document.getElementById('q10-op-medio-pub').style.borderColor = '#EF4444'; return; }

      const btn = document.getElementById('q10-op-submit');
      btn.disabled = true;
      btn.innerHTML = `<div class="q10-spinner" style="width:18px;height:18px;border-width:2px;"></div> Registrando...`;
      try {
        const cel = document.getElementById('q10-op-phone').value.replace(/\D/g, '').slice(-12);
        const email = document.getElementById('q10-op-email').value.trim();
        const tel = document.getElementById('q10-op-tel').value.trim();
        const addr = document.getElementById('q10-op-addr').value.trim();
        const muni = document.getElementById('q10-op-muni').value.trim();
        const dist = document.getElementById('q10-op-dist').value.trim();
        const medioCtc = document.getElementById('q10-op-medio-ctc').value;
        const cfPortugues = document.getElementById('q10-op-cf-portugues').value;

        const reqBody = {
          Nombre_oportunidad: ident,
          Numero_identificacion_oportunidad: ident,
          Consecutivo_como_se_entero: parseInt(medioPub),
        };
        if (cel) reqBody.Celular = cel;
        if (email) reqBody.Correo_electronico = email;
        if (tel) reqBody.Telefono = tel;
        if (addr) reqBody.Direccion = addr;
        if (muni) reqBody.Municipio = muni;
        if (dist) reqBody.Distrito = dist;
        if (medioCtc) reqBody.Consecutivo_medio_contacto = parseInt(medioCtc);
        if (cfPortugues) {
          reqBody.Campos_personalizados = [
            { Consecutivo_campo_personalizado: 1, Valor: cfPortugues }
          ];
        }
        await sendMsg('createOportunidad', { body: reqBody });
        showToast('Lead registrado en Q10 ✓', 'success');
        sendMsg('clearCache').catch(() => {});
        if (currentPhone) searchPhone(currentPhone);
        else restoreView();
      } catch (err) {
        const msg = err.message || '';
        const friendly = /no se encuentra registrado un asesor/i.test(msg)
          ? 'O asesor selecionado nas Opções não está cadastrado como asesor no Q10. Vá em Q10 → Mercadeo → Asesores e cadastre, ou troque o asesor nas Opções da extensão.'
          : msg;
        showToast(friendly, 'error');
        btn.disabled = false;
        btn.innerHTML = `${icon('check','q10-btn-icon')} Registrar Lead`;
      }
    });
  }).catch(err => {
    renderError('Error cargando datos: ' + (err?.message || err));
  });
}

export function showCreateContactoModal(phone, detectedName = null) {
  if (!detectedName) detectedName = currentContactName;
  removeModal();
  const overlay = el('div', 'q10-modal-overlay');
  const detectedFirstNames = detectedName ? detectedName.split(' ').slice(0,2).join(' ') : '';
  const detectedLastNames = detectedName && detectedName.split(' ').length > 1 ? detectedName.split(' ').slice(1).join(' ') : '';
  overlay.innerHTML = `
    <div class="q10-modal q10-modal-wide">
      <div class="q10-modal-header">
        <span class="q10-modal-title">Registrar Contacto</span>
        <button class="q10-modal-close-btn">${icon('close')}</button>
      </div>
      <div class="q10-modal-body">
        <div class="q10-form-row">
          <div class="q10-form-group"><label class="q10-form-label">Nombres *</label><input class="q10-form-input" id="q10-ct-fname" value="${htmlAttr(detectedFirstNames)}" placeholder="Primer y segundo nombre"></div>
          <div class="q10-form-group"><label class="q10-form-label">Apellidos *</label><input class="q10-form-input" id="q10-ct-lname" value="${htmlAttr(detectedLastNames)}" placeholder="Apellidos"></div>
        </div>
        <div class="q10-form-row">
          <div class="q10-form-group"><label class="q10-form-label">Celular</label><input class="q10-form-input" id="q10-ct-phone" value="${htmlAttr(phone)}" placeholder="+55 11 99999-9999"></div>
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
    const email = document.getElementById('q10-ct-email').value.trim();
    const celular = document.getElementById('q10-ct-phone').value.trim();
    if (!fname) { markError('q10-ct-fname', 'Informe os Nombres'); return; }
    if (!lname) { markError('q10-ct-lname', 'Informe os Apellidos'); return; }
    if (!email && !celular) { markError('q10-ct-phone', 'Informe ao menos celular ou email'); markError('q10-ct-email', 'Informe ao menos celular ou email'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { markError('q10-ct-email', 'Email inválido'); return; }
    const btn = document.getElementById('q10-ct-submit');
    btn.disabled = true; btn.textContent = 'Registrando...';
    try {
      const celularQ10 = celular.replace(/\D/g, '').slice(-12);
      const detalle = [];
      if (celularQ10) detalle.push({ Tipo_detalle: 'Celular', Descripcion: celularQ10 });
      if (email) detalle.push({ Tipo_detalle: 'Email', Descripcion: email });
      // Não enviar Consecutivo_oportunidad para contacto standalone — a Q10
      // tenta resolver o consecutivo (0 = não existe) e devolve 404
      // "No se encontró una oportunidad con el consecutivo especificado".
      // Probe live: POST /contactos {} reclama só de Detalle[], então este
      // campo é opcional e só faz sentido para vincular a uma oportunidade real.
      await sendMsg('createContacto', { body: { Nombres: fname, Apellidos: lname, Detalle: detalle } });
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

export function showCreateActividadModal(contactData) {
  removeModal();
  const overlay = el('div', 'q10-modal-overlay');

  // Pré-fill: aceita várias formas que cada card pode passar.
  const presetNegocio = contactData?.Consecutivo_negocio
    || contactData?.Negocio_favorito?.Consecutivo_negocio
    || '';
  const consecOportunidad = contactData?.Consecutivo_oportunidad
    || contactData?.Negocio_favorito?.Consecutivo_oportunidad
    || null;

  const TIPOS_ACTIVIDAD = ['Llamada', 'WhatsApp', 'Correo', 'Nota', 'Reunión'];
  const tipoOpts = TIPOS_ACTIVIDAD.map(t => `<option value="${htmlAttr(t)}" ${t === 'WhatsApp' ? 'selected' : ''}>${htmlText(t)}</option>`).join('');

  // Defaults para Fecha/Hora: hoje + agora.
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const hora = now.toTimeString().slice(0, 5); // "HH:MM"

  overlay.innerHTML = `
    <div class="q10-modal">
      <div class="q10-modal-header">
        <span class="q10-modal-title">Crear Actividad</span>
        <button class="q10-modal-close-btn">${icon('close')}</button>
      </div>
      <div class="q10-modal-body">
        <div class="q10-form-group"><label class="q10-form-label">Actividad *</label>
          <div style="display:flex;gap:16px;margin-top:4px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;">
              <input type="radio" name="q10-act-estado" value="C" checked> Completada
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;">
              <input type="radio" name="q10-act-estado" value="P"> Programada
            </label>
          </div>
        </div>
        <div class="q10-form-row">
          <div class="q10-form-group"><label class="q10-form-label">Tipo *</label>
            <select class="q10-form-select" id="q10-act-type">
              <option value="">Seleccione</option>
              ${tipoOpts}
            </select>
          </div>
          <div class="q10-form-group"><label class="q10-form-label">Asesor responsable</label>
            <input class="q10-form-input" id="q10-act-asesor" disabled value="Carregando..." style="background:#F3F4F6;color:#374151;">
          </div>
        </div>
        <div class="q10-form-row">
          <div class="q10-form-group"><label class="q10-form-label">Fecha *</label>
            <input class="q10-form-input" id="q10-act-fecha" type="date" value="${htmlAttr(today)}">
          </div>
          <div class="q10-form-group"><label class="q10-form-label">Hora *</label>
            <input class="q10-form-input" id="q10-act-hora" type="time" value="${htmlAttr(hora)}">
          </div>
        </div>
        <div class="q10-form-group" id="q10-act-negocio-wrap"><label class="q10-form-label">Negocio *</label>
          <select class="q10-form-select" id="q10-act-negocio-select" style="display:none;">
            <option value="">Carregando negocios...</option>
          </select>
          <input class="q10-form-input" id="q10-act-negocio" type="number" min="1" value="${htmlAttr(String(presetNegocio))}" placeholder="ID del negocio">
          <p style="font-size:11px;color:#6B7280;margin-top:4px;" id="q10-act-negocio-hint">
            Crie uma oportunidad antes — Q10 gera 1+ negocios automaticamente.
          </p>
        </div>
        <div class="q10-form-group" id="q10-act-resultado-wrap"><label class="q10-form-label">Resultado *</label>
          <textarea class="q10-form-textarea" id="q10-act-resultado" placeholder="Resultado de la interacción"></textarea>
        </div>
        <div class="q10-form-group" id="q10-act-desc-wrap" style="display:none;"><label class="q10-form-label">Descripción *</label>
          <textarea class="q10-form-textarea" id="q10-act-desc" placeholder="Detalle de la actividad programada"></textarea>
        </div>
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

  // Asesor: lê configurado + nome via /administrativos.
  Promise.all([
    sendMsg('getAsesor'),
    sendMsg('fetchAdministrativos').catch(() => [])
  ]).then(([asesorResp, adminList]) => {
    const input = document.getElementById('q10-act-asesor');
    if (!input) return;
    const id = asesorResp?.asesorId;
    if (!id) { input.value = '⚠️ Configure nas Opções'; input.style.color = '#B91C1C'; return; }
    const list = Array.isArray(adminList) ? adminList : [];
    const match = list.find(a => a.Numero_identificacion === id);
    const name = match
      ? [match.Primer_nombre, match.Segundo_nombre, match.Primer_apellido, match.Segundo_apellido].filter(Boolean).join(' ').trim()
      : '';
    input.value = name ? `${name} (${id})` : id;
  }).catch(() => {});

  // Negocios: se temos Consecutivo_oportunidad, troca o input cru por dropdown.
  if (consecOportunidad) {
    sendMsg('fetchNegocios', { consecutivoOportunidad: consecOportunidad })
      .then(negocios => {
        const list = Array.isArray(negocios) ? negocios : (negocios?.data || []);
        if (!list.length) return; // mantém o input cru
        const select = document.getElementById('q10-act-negocio-select');
        const input = document.getElementById('q10-act-negocio');
        const hint = document.getElementById('q10-act-negocio-hint');
        if (!select || !input) return;
        select.innerHTML = '<option value="">— Selecciona el negocio —</option>' +
          list.map(n => {
            const id = n.Consecutivo_negocio;
            const nombre = n.Nombre_negocio || n.Nombre || n.Descripcion || `Negocio ${id}`;
            const estado = n.Nombre_estado_negocio || n.Estado_negocio || '';
            const label = estado ? `${nombre} — ${estado}` : nombre;
            const sel = String(id) === String(presetNegocio) ? 'selected' : '';
            return `<option value="${htmlAttr(id)}" ${sel}>${htmlText(label)}</option>`;
          }).join('');
        select.style.display = '';
        input.style.display = 'none';
        if (hint) hint.textContent = `${list.length} negocio(s) encontrado(s) nesta oportunidad.`;
      })
      .catch(() => { /* mantém input cru */ });
  }

  overlay.querySelectorAll('input[name="q10-act-estado"]').forEach(radio => {
    radio.addEventListener('change', (ev) => {
      const isCompletada = ev.target.value === 'C';
      document.getElementById('q10-act-resultado-wrap').style.display = isCompletada ? '' : 'none';
      document.getElementById('q10-act-desc-wrap').style.display = isCompletada ? 'none' : '';
    });
  });

  document.getElementById('q10-act-submit').addEventListener('click', async () => {
    // Negocio: prefere o select se visível; senão input cru.
    const select = document.getElementById('q10-act-negocio-select');
    const input = document.getElementById('q10-act-negocio');
    const negocioRaw = (select && select.style.display !== 'none') ? select.value : input.value;
    const negocio = parseInt(negocioRaw, 10);
    const tipo = document.getElementById('q10-act-type').value;
    const fecha = document.getElementById('q10-act-fecha').value;
    const hora = document.getElementById('q10-act-hora').value;
    const estado = overlay.querySelector('input[name="q10-act-estado"]:checked').value;
    const resultado = document.getElementById('q10-act-resultado').value.trim();
    const desc = document.getElementById('q10-act-desc').value.trim();

    if (!negocio || Number.isNaN(negocio)) { showToast('Negocio é obrigatório', 'error'); return; }
    if (!tipo) { showToast('Tipo é obrigatório', 'error'); return; }
    if (!fecha) { showToast('Fecha é obrigatória', 'error'); return; }
    if (!hora) { showToast('Hora é obrigatória', 'error'); return; }
    if (estado === 'C' && !resultado) { showToast('Resultado obrigatório para Completada', 'error'); return; }
    if (estado === 'P' && !desc) { showToast('Descripción obrigatória para Programada', 'error'); return; }

    const btn = document.getElementById('q10-act-submit');
    btn.disabled = true; btn.textContent = 'Registrando...';
    try {
      const body = {
        Consecutivo_negocio: negocio,
        Tipo_actividad: tipo,
        Estado_actividad: estado,
        Fecha_actividad: `${fecha}T${hora}:00`,
      };
      if (estado === 'C') body.Resultado_actividad = resultado;
      else body.Descripcion_actividad = desc;
      await sendMsg('createActividad', { body });
      showToast('Actividad registrada ✓', 'success');
      removeModal();
    } catch (err) {
      const msg = err.message || '';
      const friendly = /no se encuentra registrado un asesor/i.test(msg)
        ? 'O asesor configurado nas Opções não está cadastrado como asesor no Q10. Veja Q10 → Mercadeo → Asesores.'
        : msg;
      showToast(friendly, 'error');
      btn.disabled = false; btn.textContent = 'Registrar';
    }
  });
}

// ================================================================
//  BIND ACTION BUTTONS (estudiante / oportunidad / contacto)
// ================================================================
export function bindEstudianteActions(d) {
  bindExportButtons();
  document.getElementById('q10-gen-cobro')?.addEventListener('click', () => showGenerarCobroModal(d));
  document.getElementById('q10-log-activity')?.addEventListener('click', () => showCreateActividadModal(d));
  document.getElementById('q10-refresh-fin')?.addEventListener('click', () => refreshFinancials(d));
  document.getElementById('q10-view-q10')?.addEventListener('click', () => window.open('https://app.q10.com', '_blank'));
}

export function bindOportunidadActions(d) {
  bindExportButtons();
  document.getElementById('q10-start-enrollment')?.addEventListener('click', () => {
    startEnrollmentWizard(d.Celular || d.Telefono || currentPhone, d);
  });
  document.getElementById('q10-log-activity')?.addEventListener('click', () => showCreateActividadModal(d));
  document.getElementById('q10-view-q10')?.addEventListener('click', () => window.open('https://app.q10.com', '_blank'));
}

export function bindContactoActions(data) {
  bindExportButtons();
  document.getElementById('q10-start-enrollment')?.addEventListener('click', () => {
    startEnrollmentWizard(data.Celular || data.Telefono || currentPhone, data);
  });
  document.getElementById('q10-create-lead')?.addEventListener('click', () => showCreateOportunidadModal(currentPhone, null, data));
  document.getElementById('q10-log-activity')?.addEventListener('click', () => showCreateActividadModal(data));
  document.getElementById('q10-view-q10')?.addEventListener('click', () => window.open('https://app.q10.com', '_blank'));
}

export function bindUnknownActions(detectedPhone, detectedName) {
  document.getElementById('q10-start-enrollment')?.addEventListener('click', () => startEnrollmentWizard(detectedPhone, detectedName));
  document.getElementById('q10-create-lead')?.addEventListener('click', () => showCreateOportunidadModal(detectedPhone, detectedName));
  // q10-create-contacto-only removido — ver renderer.js:renderUnknown.

  // Busca manual por código/cédula — fallback para aluno matriculado que
  // não aparece na busca por telefone (sem /usuarios login + sem /contactos).
  const findInput = document.getElementById('q10-find-student-input');
  const findBtn = document.getElementById('q10-find-student-btn');
  const findMsg = document.getElementById('q10-find-student-msg');
  if (findInput && findBtn) {
    const doFind = async () => {
      const id = findInput.value.trim();
      if (!id) return;
      findMsg.style.display = 'none';
      findBtn.disabled = true;
      const originalText = findBtn.innerHTML;
      findBtn.innerHTML = `${icon('refresh','q10-btn-icon')} Buscando...`;
      try {
        const result = await sendMsg('fetchStudentById', { id });
        setCurrentResult(result);
        renderResult(result, detectedPhone || result.phone, detectedName);
      } catch (err) {
        const friendly = /no se encuentra registrado un estudiante/i.test(err.message || '')
          ? 'No se encontró estudiante con ese código o identificación.'
          : (err.message || 'Erro buscando estudiante.');
        findMsg.textContent = friendly;
        findMsg.style.display = 'block';
        findBtn.disabled = false;
        findBtn.innerHTML = originalText;
      }
    };
    findBtn.addEventListener('click', doFind);
    findInput.addEventListener('keydown', e => { if (e.key === 'Enter') doFind(); });
  }
}

// ================================================================
//  WIZARD orchestration (exported so sidepanel.js can call it)
// ================================================================
export async function startEnrollmentWizard(phone, existingData) {
  setWizardState({
    step: 0,
    phone: phone || currentPhone,
    // Callers may pass a plain WhatsApp-detected name string, a Q10 contacto
    // ({ Nombres, Apellidos }), or an already-canonical estudiante record.
    // The wizard form reads pf.Primer_nombre/Primer_apellido/etc., so coerce
    // every shape into that schema here instead of teaching every call site.
    prefill: normalizeWizardPrefill(existingData),
    results: {}
  });

  if (!catalogsCache) {
    body().innerHTML = `<div class="q10-state"><div class="q10-spinner"></div><div class="q10-state-title">Cargando catálogos...</div></div>`;
    hideActions();
    try {
      setCatalogsCache(await sendMsg('fetchCatalogs'));
    } catch (err) {
      renderError('Error cargando catálogos: ' + err.message);
      return;
    }
  }

  renderWizardStep();
}

import { renderWizardStep, cancelWizard } from './wizard.js';