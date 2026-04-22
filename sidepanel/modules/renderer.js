/* ============================================================
   Q10 CRM — Renderer Module
   All render functions — pure DOM building, no event binding.
   Event binding is done by handlers.js.
   ============================================================ */

import { icon, el, htmlText, htmlAttr, fullNameHtml, fullName, fmtMoney, fmtDate, formatPhone } from './helpers.js';
import { AVAILABLE_TAGS, getContactNotes } from './state.js';

// ================================================================
//  BODY / ACTIONS helpers
// ================================================================
export function body() { return document.getElementById('q10-body'); }
export function actions() { return document.getElementById('q10-actions'); }
export function hideActions() { actions().style.display = 'none'; actions().innerHTML = ''; }
export function showActions(html) { const a = actions(); a.style.display = 'flex'; a.innerHTML = html; }

// ================================================================
//  PHONE DISPLAY
// ================================================================
export function phoneHtml(phone) {
  return `<div class="q10-phone-display">
    <span class="q10-phone-icon">${icon('phone')}</span>
    <span class="q10-phone-number">${htmlText(formatPhone(phone), '')}</span>
  </div>`;
}

// ================================================================
//  LOADING / ERROR STATES
// ================================================================
export function renderLoading(msg) {
  body().innerHTML = `
    <div class="q10-state">
      <div class="q10-spinner"></div>
      <div class="q10-state-title">${htmlText(msg, 'Buscando no Q10...')}</div>
      <div class="q10-state-text">Procurando dados do contato</div>
    </div>`;
  hideActions();
}

export function renderNoConversation() {
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
}

export function renderError(msg) {
  body().innerHTML = `
    <div class="q10-state">
      <span class="q10-state-icon" style="color:#EF4444">${icon('alertCircle')}</span>
      <div class="q10-state-title">Erro</div>
      <div class="q10-state-text">${htmlText(msg, 'Erro desconhecido.')}</div>
      <button class="q10-btn q10-btn-outline" id="q10-retry">Tentar novamente</button>
    </div>`;
  hideActions();
}

export function renderNoApiKey() {
  renderNoConversation();
}

// ================================================================
//  RENDER: UNKNOWN CONTACT
// ================================================================
export function renderUnknown(phoneOrName) {
  const isPhone = /^\+?\d[\d\s\-]{7,}$/.test((phoneOrName || '').replace(/[\s\-]/g, ''));
  const detectedPhone = isPhone ? phoneOrName : null;
  const detectedName = isPhone ? null : (phoneOrName || null);

  const displayHtml = isPhone
    ? phoneHtml(detectedPhone)
    : `<div class="q10-phone-display"><span class="q10-phone-icon">${icon('user')}</span><span class="q10-phone-number">${htmlText(detectedName || '', '')}</span></div>`;

  body().innerHTML = `
    ${displayHtml}
    <div class="q10-state">
      <span class="q10-state-icon">${icon('userPlus')}</span>
      <div class="q10-state-title">Contacto no encontrado</div>
      <div class="q10-state-text">${isPhone ? 'Este número no está registrado en Q10.' : 'Este contacto no está registrado en Q10.'}</div>
    </div>`;
  showActions(`
    <button class="q10-btn q10-btn-cta" id="q10-start-enrollment">${icon('graduation','q10-btn-icon')} Matricular Alumno</button>
    <button class="q10-btn q10-btn-primary" id="q10-create-lead">${icon('plus','q10-btn-icon')} Crear Oportunidad</button>
    <button class="q10-btn q10-btn-outline" id="q10-create-contacto-only">${icon('userPlus','q10-btn-icon')} Registrar Contacto</button>
  `);
}

// ================================================================
//  RENDER: ESTUDIANTE
// ================================================================
export function renderEstudiante(result) {
  const d = result.data;
  const name = fullNameHtml(d);
  const phone = d.Celular || d.Telefono || null;

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
            <div class="q10-info-row"><span class="q10-info-label">Concepto</span><span class="q10-info-value">${htmlText(p.Concepto || p.Descripcion || p.Nombre)}</span></div>
            <div class="q10-info-row"><span class="q10-info-label">Valor</span><span class="q10-info-value"><span class="q10-badge q10-badge-red">${fmtMoney(p.Valor || p.Monto || p.Saldo)}</span></span></div>
            ${p.Fecha_vencimiento ? `<div class="q10-info-row"><span class="q10-info-label">Vencimiento</span><span class="q10-info-value">${fmtDate(p.Fecha_vencimiento)}</span></div>` : ''}
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
    ${phone ? phoneHtml(phone) : ''}
    <span class="q10-contact-type q10-type-estudiante">${icon('graduation','q10-section-icon')} Estudiante</span>
    <div class="q10-contact-name">${name}</div>
    <div class="q10-contact-id">ID: ${htmlText(d.Codigo)} &middot; ${htmlText(d.Numero_identificacion, '')}</div>
    <div class="q10-section">
      <div class="q10-section-title">${icon('user','q10-section-icon')} Información Personal</div>
      <div class="q10-info-card">
        <div class="q10-info-row"><span class="q10-info-label">Email</span><span class="q10-info-value">${htmlText(d.Email)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Teléfono</span><span class="q10-info-value">${htmlText(d.Telefono)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Celular</span><span class="q10-info-value">${htmlText(d.Celular)}</span></div>
      </div>
    </div>
    <div class="q10-section">
      <div class="q10-section-title">${icon('book','q10-section-icon')} Académico</div>
      <div class="q10-info-card">
        <div class="q10-info-row"><span class="q10-info-label">Programa</span><span class="q10-info-value">${htmlText(d.Programa || d.Nombre_programa)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Estado Matrícula</span>
          <span class="q10-info-value"><span class="q10-badge ${d.Estado_matricula==='Activo'?'q10-badge-green':'q10-badge-gray'}">${htmlText(d.Estado_matricula)}</span></span>
        </div>
        <div class="q10-info-row"><span class="q10-info-label">Periodo</span><span class="q10-info-value">${htmlText(d.Periodo || d.Nombre_periodo)}</span></div>
      </div>
    </div>
    ${financialHtml}
    <div id="q10-tags-notes-container"></div>
  `;

  showActions(`
    <button class="q10-btn q10-btn-cta" id="q10-gen-cobro">${icon('dollar','q10-btn-icon')} Generar Cobro</button>
    <button class="q10-btn q10-btn-success" id="q10-log-activity">${icon('clipboard','q10-btn-icon')} Registrar Actividad</button>
    <button class="q10-btn q10-btn-outline" id="q10-refresh-fin">${icon('refresh','q10-btn-icon')} Actualizar Financiero</button>
    <button class="q10-btn q10-btn-secondary" id="q10-export-data">${icon('clipboard','q10-btn-icon')} Exportar Datos</button>
    <button class="q10-btn q10-btn-secondary" id="q10-export-chat">${icon('fileText','q10-btn-icon')} Exportar Chat</button>
    <button class="q10-btn q10-btn-outline" id="q10-view-q10">${icon('externalLink','q10-btn-icon')} Ver en Q10</button>
  `);
}

// ================================================================
//  RENDER: CONTACTO
// ================================================================
export function renderContacto(data) {
  const name = fullNameHtml(data);
  body().innerHTML = `
    ${phoneHtml(data.Celular||data.Telefono||null)}
    <span class="q10-contact-type q10-type-contacto">${icon('user','q10-section-icon')} Contacto</span>
    <div class="q10-contact-name">${name}</div>
    <div class="q10-contact-id">ID: ${htmlText(data.Codigo)} &middot; ${htmlText(data.Numero_identificacion, '')}</div>
    <div class="q10-section">
      <div class="q10-section-title">${icon('user','q10-section-icon')} Información</div>
      <div class="q10-info-card">
        <div class="q10-info-row"><span class="q10-info-label">Email</span><span class="q10-info-value">${htmlText(data.Email)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Teléfono</span><span class="q10-info-value">${htmlText(data.Telefono)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Celular</span><span class="q10-info-value">${htmlText(data.Celular)}</span></div>
      </div>
    </div>
    <div id="q10-tags-notes-container"></div>`;

  showActions(`
    <button class="q10-btn q10-btn-cta" id="q10-start-enrollment">${icon('graduation','q10-btn-icon')} Matricular Alumno</button>
    <button class="q10-btn q10-btn-primary" id="q10-create-lead">${icon('plus','q10-btn-icon')} Crear Oportunidad</button>
    <button class="q10-btn q10-btn-success" id="q10-log-activity">${icon('clipboard','q10-btn-icon')} Registrar Actividad</button>
    <button class="q10-btn q10-btn-secondary" id="q10-export-data">${icon('clipboard','q10-btn-icon')} Exportar Datos</button>
    <button class="q10-btn q10-btn-secondary" id="q10-export-chat">${icon('fileText','q10-btn-icon')} Exportar Chat</button>
    <button class="q10-btn q10-btn-outline" id="q10-view-q10">${icon('externalLink','q10-btn-icon')} Ver en Q10</button>
  `);
}

// ================================================================
//  RENDER: OPORTUNIDAD
// ================================================================
export function renderOportunidad(result) {
  const d = result.data;
  const name = fullNameHtml(d);

  let negociosHtml = '';
  if (result.negocios && result.negocios.length > 0) {
    negociosHtml = `
      <div class="q10-section">
        <div class="q10-section-title">${icon('briefcase','q10-section-icon')} Negocios</div>
        ${result.negocios.map(n => `
          <div class="q10-info-card">
            <div class="q10-info-row"><span class="q10-info-label">Negocio</span><span class="q10-info-value">${htmlText(n.Nombre || n.Descripcion)}</span></div>
            <div class="q10-info-row"><span class="q10-info-label">Valor</span><span class="q10-info-value">${fmtMoney(n.Valor)}</span></div>
            <div class="q10-info-row"><span class="q10-info-label">Estado</span><span class="q10-info-value"><span class="q10-badge q10-badge-blue">${htmlText(n.Estado)}</span></span></div>
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
            <div class="q10-activity-type">${htmlText(a.Tipo, 'Actividad')}</div>
            <div class="q10-activity-desc">${htmlText(a.Descripcion || a.Observaciones)}</div>
            <div class="q10-activity-date">${a.Fecha ? fmtDate(a.Fecha) : ''}</div>
          </div>`).join('')}
      </div>`;
  }

  body().innerHTML = `
    ${phoneHtml(d.Celular||d.Telefono||null)}
    <span class="q10-contact-type q10-type-oportunidad">${icon('briefcase','q10-section-icon')} Lead / Oportunidad</span>
    <div class="q10-contact-name">${name}</div>
    <div class="q10-contact-id">ID: ${htmlText(d.Codigo)}</div>
    <div class="q10-section">
      <div class="q10-section-title">${icon('user','q10-section-icon')} Información</div>
      <div class="q10-info-card">
        <div class="q10-info-row"><span class="q10-info-label">Email</span><span class="q10-info-value">${htmlText(d.Email)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Teléfono</span><span class="q10-info-value">${htmlText(d.Telefono)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Celular</span><span class="q10-info-value">${htmlText(d.Celular)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Estado</span><span class="q10-info-value"><span class="q10-badge q10-badge-yellow">${htmlText(d.Estado || d.Etapa)}</span></span></div>
      </div>
    </div>
    ${negociosHtml}
    ${actividadesHtml}
    <div id="q10-tags-notes-container"></div>
  `;

  showActions(`
    <button class="q10-btn q10-btn-cta" id="q10-start-enrollment">${icon('graduation','q10-btn-icon')} Matricular Alumno</button>
    <button class="q10-btn q10-btn-success" id="q10-log-activity">${icon('clipboard','q10-btn-icon')} Registrar Actividad</button>
    <button class="q10-btn q10-btn-secondary" id="q10-export-data">${icon('clipboard','q10-btn-icon')} Exportar Datos</button>
    <button class="q10-btn q10-btn-secondary" id="q10-export-chat">${icon('fileText','q10-btn-icon')} Exportar Chat</button>
    <button class="q10-btn q10-btn-outline" id="q10-view-q10">${icon('externalLink','q10-btn-icon')} Ver en Q10</button>
  `);
}

// ================================================================
//  TAGS & NOTES sections
// ================================================================
export function renderTagsSection(contactId, existingTags) {
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

export async function renderNotesSection(contactId) {
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

export async function attachTagsAndNotes(contactId) {
  const container = document.getElementById('q10-tags-notes-container');
  if (!container) return;
  const { getContactTags } = await import('./state.js');
  const tags = await getContactTags(contactId);
  const tagsHtml = renderTagsSection(contactId, tags);
  const notesHtml = await renderNotesSection(contactId);
  container.innerHTML = tagsHtml + notesHtml;
}

// ================================================================
//  EXPORT helpers
// ================================================================
export function generateCSV(data) {
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

export function downloadCSV(csv, filename) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}