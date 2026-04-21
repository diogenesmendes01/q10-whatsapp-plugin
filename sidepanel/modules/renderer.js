/* ============================================================
   Q10 CRM — Side Panel
   Module: UI Rendering
   v3.0
   ============================================================ */

window.Q10SidePanel = window.Q10SidePanel || {};

const { api, dom, state, handlers } = window.Q10SidePanel;
const { sendMsg, showToast, fetchStudentFinancials } = api;
const { escHtml, htmlText, htmlAttr, fullNameHtml, el, icon, fmtMoney,
        body, actions, hideActions, showActions, removeModal,
        formatPhone, phoneHtml, wizardStepperHtml } = dom;
const { WIZARD_STEPS } = state;
const { bindExportButtons, attachTagsAndNotes, searchPhone,
        startEnrollmentWizard, refreshFinancials } = handlers;

// ================================================================
//  Simple Render States
// ================================================================
function renderLoading(msg) {
  body().innerHTML = `
    <div class="q10-state">
      <div class="q10-spinner"></div>
      <div class="q10-state-title">${htmlText(msg, 'Buscando no Q10...')}</div>
      <div class="q10-state-text">Procurando dados do contato</div>
    </div>`;
  hideActions();
}

function renderNoApiKey() {
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
    const isPhone = /^\+?\d[\d\s\-]{7,}$/.test(value.replace(/[\s\-]/g, ''));
    if (isPhone) {
      handlers.searchPhone(value.replace(/[\s\-\(\)]/g, ''));
    } else {
      renderLoading('Buscando: ' + value + '...');
      chrome.runtime.sendMessage({ action: 'searchName', name: value }, (resp) => {
        if (resp && resp.ok) {
          state.setCurrentResult(resp.data);
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
      <span class="q10-state-icon" style="color:#EF4444">${dom.ICONS.alertCircle}</span>
      <div class="q10-state-title">Erro</div>
      <div class="q10-state-text">${htmlText(msg, 'Erro desconhecido.')}</div>
      <button class="q10-btn q10-btn-outline" id="q10-retry">Tentar novamente</button>
    </div>`;
  hideActions();
  document.getElementById('q10-retry').addEventListener('click', () => {
    if (state.getCurrentPhone()) handlers.searchPhone(state.getCurrentPhone());
  });
}

// ================================================================
//  Render: Unknown Contact
// ================================================================
function renderUnknown(phoneOrName) {
  const isPhone = /^\+?\d[\d\s\-]{7,}$/.test((phoneOrName || '').replace(/[\s\-]/g, ''));
  const detectedPhone = isPhone ? phoneOrName : state.getCurrentPhone();
  const detectedName = isPhone ? state.getCurrentContactName() : (phoneOrName || state.getCurrentContactName());

  body().innerHTML = `
    ${phoneHtml(detectedPhone)}
    <span class="q10-contact-type q10-type-unknown">${icon('user','q10-section-icon')} Contacto Não Identificado</span>
    <div class="q10-contact-name">${htmlText(detectedName || '—')}</div>
    <div class="q10-contact-id">${isPhone ? htmlText(detectedPhone) : ''}</div>
    <div class="q10-section">
      <div class="q10-section-title">${icon('plus','q10-section-icon')} Criar no Q10</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <button class="q10-btn q10-btn-cta" id="q10-create-contacto">
          ${icon('userPlus','q10-btn-icon')} Criar Contato
        </button>
        <button class="q10-btn q10-btn-primary" id="q10-create-lead">
          ${icon('briefcase','q10-btn-icon')} Criar Lead / Oportunidade
        </button>
      </div>
    </div>`;
  hideActions();

  document.getElementById('q10-create-contacto').addEventListener('click', () => {
    showCreateContactoModal(detectedPhone, detectedName);
  });
  document.getElementById('q10-create-lead').addEventListener('click', () => {
    showCreateOportunidadModal(detectedPhone, detectedName, null);
  });
}

// ================================================================
//  Render: Estudiante
// ================================================================
function renderEstudiante(result) {
  const d = result.data;
  const name = fullNameHtml(d);
  const phone = d.Celular || d.Telefono || state.getCurrentPhone();

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

// ================================================================
//  Render: Oportunidad
// ================================================================
function renderOportunidad(result) {
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
            <div class="q10-activity-date">${a.Fecha?new Date(a.Fecha).toLocaleDateString('es'):''}</div>
          </div>`).join('')}
      </div>`;
  }

  body().innerHTML = `
    ${phoneHtml(d.Celular||d.Telefono||state.getCurrentPhone())}
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
    startEnrollmentWizard(d.Celular || d.Telefono || state.getCurrentPhone(), d);
  });
  document.getElementById('q10-log-activity').addEventListener('click', () => showCreateActividadModal(d));
  document.getElementById('q10-view-q10').addEventListener('click', () => window.open('https://app.q10.com', '_blank'));
}

// ================================================================
//  Render: Contacto
// ================================================================
function renderContacto(data) {
  const name = fullNameHtml(data);
  body().innerHTML = `
    ${phoneHtml(data.Celular||data.Telefono||state.getCurrentPhone())}
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
    startEnrollmentWizard(data.Celular || data.Telefono || state.getCurrentPhone(), data);
  });
  document.getElementById('q10-create-lead').addEventListener('click', () => showCreateOportunidadModal(state.getCurrentPhone(), null, data));
  document.getElementById('q10-log-activity').addEventListener('click', () => showCreateActividadModal(data));
  document.getElementById('q10-view-q10').addEventListener('click', () => window.open('https://app.q10.com', '_blank'));
}

// ================================================================
//  Render Dispatcher
// ================================================================
function renderResult(result) {
  state.setCurrentResult(result);
  switch (result.type) {
    case 'estudiante': renderEstudiante(result); break;
    case 'oportunidad': renderOportunidad(result); break;
    case 'contacto': renderContacto(result.data); break;
    default: renderUnknown(result.phone); break;
  }
}

// ================================================================
//  Wizard Rendering
// ================================================================
function renderWizardStep() {
  const ws = state.getWizardState();
  const step = ws.step;
  const pf = ws.prefill;
  const res = ws.results;
  const catalogs = state.getCatalogsCache();

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
        <div class="q10-form-group"><label class="q10-form-label">Primer Nombre *</label><input class="q10-form-input" id="wz-fname" value="${htmlAttr(pf.Primer_nombre)}" placeholder="Nombre"></div>
        <div class="q10-form-group"><label class="q10-form-label">Segundo Nombre</label><input class="q10-form-input" id="wz-fname2" value="${htmlAttr(pf.Segundo_nombre)}" placeholder="Segundo nombre"></div>
        <div class="q10-form-group"><label class="q10-form-label">Primer Apellido *</label><input class="q10-form-input" id="wz-lname" value="${htmlAttr(pf.Primer_apellido)}" placeholder="Apellido"></div>
        <div class="q10-form-group"><label class="q10-form-label">Segundo Apellido</label><input class="q10-form-input" id="wz-lname2" value="${htmlAttr(pf.Segundo_apellido)}" placeholder="Segundo apellido"></div>
        <div class="q10-form-group"><label class="q10-form-label">Número de Identificación *</label><input class="q10-form-input" id="wz-docnum" value="${htmlAttr(pf.Numero_identificacion)}" placeholder="CPF / Cédula / Pasaporte"></div>
        <div class="q10-form-group"><label class="q10-form-label">Email</label><input class="q10-form-input" id="wz-email" type="email" value="${htmlAttr(pf.Email)}" placeholder="email@ejemplo.com"></div>
        <div class="q10-form-group"><label class="q10-form-label">Celular</label><input class="q10-form-input" id="wz-phone" value="${htmlAttr(ws.phone)}" placeholder="+502 4512-3489"></div>
      `;
      break;

    case 1: {
      const doctypeOpts = (catalogs?.tiposIdentificacion || [])
        .map(t => `<option value="${escHtml(t.Codigo)}">${escHtml(t.Nombre)} (${escHtml(t.Abreviatura || t.Codigo)})</option>`)
        .join('');
      const genderOpts = (catalogs?.sexos || [])
        .map(s => `<option value="${escHtml(s.Codigo_sexo)}">${escHtml(s.Nombre_sexo)}</option>`)
        .join('');
      const progOptsCase1 = (catalogs?.programas || [])
        .map(p => `<option value="${escHtml(p.Codigo)}">${escHtml(p.Nombre || p.Codigo)}</option>`)
        .join('');
      formHtml = `
        <div class="q10-wizard-step-header">
          ${icon('userPlus','q10-wizard-step-icon')}
          <div>
            <div class="q10-wizard-step-title">Paso 2: Registrar Estudiante</div>
            <div class="q10-wizard-step-desc">Complete los datos académicos del alumno</div>
          </div>
        </div>
        <div class="q10-info-card" style="margin-bottom:16px;background:#F0FDF4;border-color:#BBF7D0;">
          <div style="font-size:12px;color:#065F46;">✅ Contacto creado: <strong>${fullNameHtml(res.contacto)}</strong></div>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Tipo de Identificación *</label>
          <select class="q10-form-select" id="wz-doctype">
            <option value="">— Seleccionar —</option>${doctypeOpts || '<option value="" disabled>No hay tipos disponibles</option>'}
          </select>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Fecha de Nacimiento *</label><input class="q10-form-input" id="wz-birthdate" type="date" required></div>
        <div class="q10-form-group"><label class="q10-form-label">Género *</label>
          <select class="q10-form-select" id="wz-gender">
            <option value="">— Seleccionar —</option>${genderOpts || '<option value="" disabled>No hay datos</option>'}
          </select>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Programa *</label>
          <select class="q10-form-select" id="wz-programa-init">
            <option value="">— Seleccionar programa —</option>${progOptsCase1 || '<option value="" disabled>No hay programas</option>'}
          </select>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Observaciones</label><textarea class="q10-form-textarea" id="wz-est-obs" placeholder="Notas adicionales..."></textarea></div>
      `;
      break;
    }

    case 2: {
      const preselectedProg = res.estudiante?.Codigo_programa_inicial;
      const programasOpts = (catalogs?.programas || [])
        .map(p => `<option value="${escHtml(p.Codigo)}" ${p.Codigo === preselectedProg ? 'selected' : ''}>${escHtml(p.Nombre || p.Codigo)}</option>`)
        .join('');
      const periodosOpts = (catalogs?.periodos || [])
        .map(p => `<option value="${escHtml(p.Consecutivo)}">${escHtml(p.Nombre || p.Consecutivo)}</option>`)
        .join('');
      const jornadaOpts = (catalogs?.jornadas || [])
        .map(j => `<option value="${escHtml(j.Codigo)}">${escHtml(j.Nombre)}</option>`)
        .join('');
      formHtml = `
        <div class="q10-wizard-step-header">
          ${icon('book','q10-wizard-step-icon')}
          <div>
            <div class="q10-wizard-step-title">Paso 3: Inscribir en Programa</div>
            <div class="q10-wizard-step-desc">Seleccione el programa y periodo académico</div>
          </div>
        </div>
        <div class="q10-info-card" style="margin-bottom:16px;background:#F0FDF4;border-color:#BBF7D0;">
          <div style="font-size:12px;color:#065F46;">✅ Estudiante registrado: <strong>${fullNameHtml(res.contacto)}</strong></div>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Programa *</label>
          <select class="q10-form-select" id="wz-programa"><option value="">— Seleccionar programa —</option>${programasOpts || '<option value="" disabled>No hay programas</option>'}</select>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Periodo *</label>
          <select class="q10-form-select" id="wz-periodo"><option value="">— Seleccionar periodo —</option>${periodosOpts || '<option value="" disabled>No hay periodos</option>'}</select>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Jornada</label>
          <select class="q10-form-select" id="wz-jornada"><option value="">— Seleccionar jornada —</option>${jornadaOpts || '<option value="" disabled>No hay jornadas</option>'}</select>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Observaciones</label><textarea class="q10-form-textarea" id="wz-insc-obs" placeholder="Notas..."></textarea></div>
      `;
      break;
    }

    case 3: {
      const progName = catalogs?.programas?.find(p => p.Codigo === res.inscripcion?.Codigo_programa)?.Nombre || res.inscripcion?.Codigo_programa || '—';
      const perName = catalogs?.periodos?.find(p => p.Consecutivo === res.inscripcion?.Consecutivo_periodo)?.Nombre || res.inscripcion?.Consecutivo_periodo || '—';
      const nivelOpts = (catalogs?.niveles || [])
        .map(n => `<option value="${escHtml(n.Codigo_nivel)}">${escHtml(n.Nombre_nivel)}</option>`)
        .join('');
      const sedejornadaOpts = (catalogs?.sedesjornadas || [])
        .map(sj => `<option value="${escHtml(sj.Consecutivo)}">${escHtml(sj.Sede_jornada || ((sj.Nombre_sede || '') + ' - ' + (sj.Nombre_jornada || '')))}</option>`)
        .join('');
      const condicionOpts = (catalogs?.condicionesMatricula || [])
        .map(c => `<option value="${escHtml(c.Codigo)}">${escHtml(c.Nombre)}</option>`)
        .join('');
      const todayIso = new Date().toISOString().split('T')[0];
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
          <div class="q10-section-title">Resumen</div>
          <div class="q10-info-card">
            <div class="q10-info-row"><span class="q10-info-label">Alumno</span><span class="q10-info-value">${fullNameHtml(res.contacto)}</span></div>
            <div class="q10-info-row"><span class="q10-info-label">Programa</span><span class="q10-info-value">${htmlText(progName)}</span></div>
            <div class="q10-info-row"><span class="q10-info-label">Periodo</span><span class="q10-info-value">${htmlText(perName)}</span></div>
          </div>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Nivel *</label>
          <select class="q10-form-select" id="wz-mat-nivel">
            <option value="">— Seleccionar nivel —</option>${nivelOpts || '<option value="" disabled>No hay niveles</option>'}
          </select>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Fecha de Matrícula *</label><input class="q10-form-input" id="wz-mat-fecha" type="date" value="${todayIso}" required></div>
        <div class="q10-form-group"><label class="q10-form-label">Sede-Jornada *</label>
          <select class="q10-form-select" id="wz-mat-sedejornada">
            <option value="">— Seleccionar —</option>${sedejornadaOpts || '<option value="" disabled>No hay sede-jornadas</option>'}
          </select>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Condición de Matrícula *</label>
          <select class="q10-form-select" id="wz-mat-condicion">
            <option value="">— Seleccionar —</option>${condicionOpts || '<option value="" disabled>No hay condiciones</option>'}
          </select>
        </div>
        <div class="q10-form-group">
          <label style="display:flex;align-items:center;gap:8px;font-size:14px;color:#111;cursor:pointer;">
            <input type="checkbox" id="wz-mat-formalizada" checked> Formalizada
          </label>
        </div>
      `;
      break;
    }

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
    document.getElementById('wz-cancel').addEventListener('click', handlers.cancelWizard);
  } else {
    document.getElementById('wz-back').addEventListener('click', () => { state.getWizardState().step--; renderWizardStep(); });
  }
  document.getElementById('wz-next').addEventListener('click', submitWizardStep);
}

async function submitWizardStep() {
  const ws = state.getWizardState();
  const step = ws.step;
  const btn = document.getElementById('wz-next');
  const res = ws.results;

  btn.disabled = true;
  btn.innerHTML = `<div class="q10-spinner" style="width:18px;height:18px;border-width:2px;"></div> Procesando...`;

  try {
    switch (step) {
      case 0: {
        const fname = document.getElementById('wz-fname').value.trim();
        const fname2 = document.getElementById('wz-fname2').value.trim();
        const lname = document.getElementById('wz-lname').value.trim();
        const lname2 = document.getElementById('wz-lname2').value.trim();
        const wzDocnum = document.getElementById('wz-docnum').value.trim();
        if (!fname || !lname) throw new Error('Nombre y apellido son obligatorios.');
        const wzEmail = document.getElementById('wz-email').value.trim();
        const wzCelularRaw = document.getElementById('wz-phone').value.trim();
        if (!wzEmail && !wzCelularRaw) throw new Error('Informe email ou celular (ao menos um).');
        if (!wzDocnum) throw new Error('Número de Identificación es obligatorio para avanzar al registro de estudiante.');
        const wzCelularQ10 = wzCelularRaw.replace(/\D/g, '').slice(-12);
        const wzDetalle = [];
        if (wzEmail) wzDetalle.push({ Tipo_detalle: 'Email', Descripcion: wzEmail });
        if (wzCelularQ10) wzDetalle.push({ Tipo_detalle: 'Celular', Descripcion: wzCelularQ10 });
        const payload = {
          Consecutivo_oportunidad: 0,
          Nombres: [fname, fname2].filter(Boolean).join(' '),
          Apellidos: [lname, lname2].filter(Boolean).join(' '),
          Detalle: wzDetalle,
        };
        const result = await sendMsg('createContacto', { body: payload });
        res.contacto = {
          ...payload, ...result,
          Primer_nombre: fname, Segundo_nombre: fname2 || null,
          Primer_apellido: lname, Segundo_apellido: lname2 || null,
          Email: wzEmail, Celular: wzCelularQ10,
          Numero_identificacion: wzDocnum,
        };
        showToast('Contacto creado ✓', 'success');
        break;
      }
      case 1: {
        const doctype = document.getElementById('wz-doctype').value;
        const birthdate = document.getElementById('wz-birthdate').value;
        const gender = document.getElementById('wz-gender').value;
        const programa = document.getElementById('wz-programa-init').value;
        if (!doctype) throw new Error('Tipo de Identificación es obligatorio.');
        if (!birthdate) throw new Error('Fecha de nacimiento es obligatoria.');
        if (!gender) throw new Error('Género es obligatorio.');
        if (!programa) throw new Error('Programa es obligatorio.');
        if (!res.contacto.Numero_identificacion) throw new Error('Número de identificación no fue ingresado en el paso anterior.');
        const payload = {
          Primer_nombre: res.contacto.Primer_nombre,
          Primer_apellido: res.contacto.Primer_apellido,
          Codigo_tipo_identificacion: doctype,
          Numero_identificacion: res.contacto.Numero_identificacion,
          Genero: gender,
          Email: res.contacto.Email,
          Celular: res.contacto.Celular,
          Fecha_nacimiento: birthdate,
          Codigo_programa: programa,
        };
        const result = await sendMsg('createEstudiante', { body: payload });
        res.estudiante = { ...payload, ...result, Codigo_programa_inicial: programa };
        showToast('Estudiante registrado ✓', 'success');
        break;
      }
      case 2: {
        const programa = document.getElementById('wz-programa').value;
        const periodo = document.getElementById('wz-periodo').value;
        if (!programa || !periodo) throw new Error('Seleccione programa y periodo.');
        const codigoEstudiante = res.estudiante.Codigo_estudiante || res.estudiante.Codigo;
        if (!codigoEstudiante) throw new Error('Código del estudiante no disponible. Vuelva al paso anterior.');
        const payload = {
          Codigo_estudiante: codigoEstudiante,
          Codigo_programa: programa,
          Consecutivo_periodo: parseInt(periodo, 10),
          Codigo_jornada: document.getElementById('wz-jornada').value || null,
          Observaciones: document.getElementById('wz-insc-obs').value.trim(),
        };
        const result = await sendMsg('createInscripcion', { body: payload });
        res.inscripcion = { ...payload, ...result };
        showToast('Inscripción realizada ✓', 'success');
        break;
      }
      case 3: {
        const nivel = document.getElementById('wz-mat-nivel').value;
        const fecha = document.getElementById('wz-mat-fecha').value;
        const sedeJornada = parseInt(document.getElementById('wz-mat-sedejornada').value, 10);
        const condicion = document.getElementById('wz-mat-condicion').value.trim();
        const formalizada = document.getElementById('wz-mat-formalizada').checked;
        if (!nivel) throw new Error('Seleccione el nivel.');
        if (!fecha) throw new Error('Fecha de matrícula es obligatoria.');
        if (!sedeJornada || Number.isNaN(sedeJornada)) throw new Error('Consecutivo sede-jornada es obligatorio.');
        if (!condicion) throw new Error('Condición de matrícula es obligatoria (valor Q10 exacto).');
        if (!res.inscripcion?.Consecutivo_inscripcion) throw new Error('Consecutivo de inscripción no disponible del paso anterior.');
        const codigoEstudiante = res.estudiante.Codigo_estudiante || res.estudiante.Codigo;
        if (!codigoEstudiante) throw new Error('Código del estudiante no disponible.');
        const payload = {
          Consecutivo_inscripcion: res.inscripcion.Consecutivo_inscripcion,
          Codigo_estudiante: codigoEstudiante,
          Fecha_matricula: fecha,
          Consecutivo_sede_jornada: sedeJornada,
          Consecutivo_periodo: res.inscripcion.Consecutivo_periodo,
          Codigo_nivel: nivel,
          Condicion_matricula: condicion,
          Formalizada: formalizada,
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
        const codigoEstudiante = res.estudiante.Codigo_estudiante || res.estudiante.Codigo;
        const payload = {
          Codigo_estudiante: codigoEstudiante,
          Concepto: concepto,
          Valor: parseFloat(valor),
          Fecha_vencimiento: fecha,
          Observaciones: document.getElementById('wz-cobro-obs').value.trim(),
        };
        try {
          const result = await sendMsg('createOrdenPago', { body: payload });
          res.cobro = { ...payload, ...result };
          showToast('Orden de pago generada ✓', 'success');
        } catch (e) {
          if (e && e.message && /modelo financiero/i.test(e.message)) {
            res.cobro = { skipped: true, reason: 'modelo_financiero_ausente' };
            showToast('Cobro no disponible: esta institución no tiene modelo financiero Q10. Matrícula completada sin orden de pago.', 'info');
          } else {
            throw e;
          }
        }
        renderWizardComplete();
        return;
      }
    }
    ws.step++;
    renderWizardStep();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    const isLast = step === WIZARD_STEPS.length - 1;
    btn.innerHTML = isLast ? `${icon('check','q10-btn-icon')} Finalizar` : `Siguiente ${icon('arrowRight','q10-btn-icon')}`;
  }
}

function renderWizardComplete() {
  const res = state.getWizardState().results;
  const catalogs = state.getCatalogsCache();
  const progName = catalogs?.programas?.find(p => p.Codigo === res.inscripcion?.Codigo_programa)?.Nombre || '—';

  body().innerHTML = `
    <div class="q10-wizard-complete">
      <div class="q10-complete-icon">${dom.ICONS.check}</div>
      <h2 class="q10-complete-title">¡Matrícula completada!</h2>
      <div class="q10-complete-summary">
        <div class="q10-complete-row"><span>Contacto</span><strong>${fullNameHtml(res.contacto)}</strong></div>
        <div class="q10-complete-row"><span>Programa</span><strong>${htmlText(progName)}</strong></div>
        <div class="q10-complete-row"><span>Estudiante</span><strong>${htmlText(res.estudiante?.Codigo_estudiante || res.estudiante?.Codigo, '—')}</strong></div>
      </div>
      <button class="q10-btn q10-btn-primary" id="q10-complete-close" style="margin-top:20px;width:100%;">
        ${icon('arrowRight','q10-btn-icon')} Cerrar
      </button>
    </div>
  `;
  hideActions();
  document.getElementById('q10-complete-close').addEventListener('click', () => {
    state.setWizardState(null);
    const result = state.getCurrentResult();
    if (result) renderResult(result);
    else renderNoConversation();
  });
}

// ================================================================
//  Modals
// ================================================================
function showGenerarCobroModal(studentData) {
  removeModal();
  const overlay = el('div', 'q10-modal-overlay');
  overlay.innerHTML = `
    <div class="q10-modal">
      <div class="q10-modal-header">
        <span class="q10-modal-title">${icon('dollar','q10-btn-icon')} Generar Cobro</span>
        <button class="q10-modal-close-btn">${dom.ICONS.close}</button>
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

function showCreateOportunidadModal(phone, detectedName = null, contactData = null) {
  removeModal();
  const prefillName = detectedName || (contactData ? [contactData.Nombres || contactData.Primer_nombre, contactData.Apellidos || contactData.Primer_apellido].filter(Boolean).join(' ') : '');
  const prefillPhone = (phone || contactData?.Celular || '').replace(/\D/g,'').slice(-12);
  const prefillEmail = contactData?.Email || contactData?.Correo_electronico || '';

  const overlay = el('div', 'q10-modal-overlay');
  overlay.innerHTML = `
    <div class="q10-modal q10-modal-wide">
      <div class="q10-modal-header">
        <span class="q10-modal-title">Registrar Lead / Oportunidad</span>
        <button class="q10-modal-close-btn">${dom.ICONS.close}</button>
      </div>
      <div class="q10-modal-body">
        <div class="q10-form-group">
          <label class="q10-form-label">Nome do Lead *</label>
          <input class="q10-form-input" id="q10-op-nome" value="${htmlAttr(prefillName)}" placeholder="Ex: João Silva — Inglês Básico">
        </div>
        <div class="q10-form-row">
          <div class="q10-form-group"><label class="q10-form-label">Celular</label><input class="q10-form-input" id="q10-op-phone" value="${htmlAttr(prefillPhone)}" placeholder="19988145438"></div>
          <div class="q10-form-group"><label class="q10-form-label">Email</label><input class="q10-form-input" id="q10-op-email" type="email" value="${htmlAttr(prefillEmail)}" placeholder="email@ejemplo.com"></div>
        </div>
        <div class="q10-form-row">
          <div class="q10-form-group">
            <label class="q10-form-label">Como nos conheceu?</label>
            <select class="q10-form-select" id="q10-op-medio-pub"><option value="">Carregando...</option></select>
          </div>
          <div class="q10-form-group">
            <label class="q10-form-label">Canal de contato</label>
            <select class="q10-form-select" id="q10-op-medio-ctc"><option value="">Carregando...</option></select>
          </div>
        </div>
      </div>
      <div class="q10-modal-footer">
        <button class="q10-btn q10-btn-outline q10-modal-cancel">Cancelar</button>
        <button class="q10-btn q10-btn-cta" id="q10-op-submit">Registrar Lead</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.q10-modal-close-btn').addEventListener('click', removeModal);
  overlay.querySelector('.q10-modal-cancel').addEventListener('click', removeModal);

  sendMsg('fetchMedios').then(data => {
    const pubSel = document.getElementById('q10-op-medio-pub');
    const ctcSel = document.getElementById('q10-op-medio-ctc');
    if (!pubSel || !ctcSel) return;

    pubSel.innerHTML = '<option value="">— Como conheceu? —</option>' +
      (data.mediospublicitarios || []).map(m =>
        `<option value="${escHtml(m.Consecutivo)}">${escHtml(m.Nombre || m.Descripcion || m.Consecutivo)}</option>`
      ).join('');

    ctcSel.innerHTML = '<option value="">— Canal —</option>' +
      (data.medioscontacto || []).map(m =>
        `<option value="${escHtml(m.Consecutivo)}">${escHtml(m.Nombre || m.Descripcion || m.Consecutivo)}</option>`
      ).join('');

    Array.from(ctcSel.options).forEach(opt => {
      if (opt.text.toLowerCase().includes('whatsapp')) ctcSel.value = opt.value;
    });
  }).catch(() => {
    const pubSel = document.getElementById('q10-op-medio-pub');
    const ctcSel = document.getElementById('q10-op-medio-ctc');
    if (pubSel) pubSel.innerHTML = '<option value="">— Não disponível —</option>';
    if (ctcSel) ctcSel.innerHTML = '<option value="">— Não disponível —</option>';
  });

  document.getElementById('q10-op-submit').addEventListener('click', async () => {
    const nome = document.getElementById('q10-op-nome').value.trim();
    if (!nome) { showToast('Nome do lead é obrigatório', 'error'); document.getElementById('q10-op-nome').style.borderColor='#EF4444'; return; }
    const btn = document.getElementById('q10-op-submit');
    btn.disabled = true; btn.textContent = 'Registrando...';
    try {
      const body = { Nombre_oportunidad: nome };
      const cel = document.getElementById('q10-op-phone').value.replace(/\D/g,'').slice(-12);
      const email = document.getElementById('q10-op-email').value.trim();
      const medioPub = document.getElementById('q10-op-medio-pub').value;
      const medioCtc = document.getElementById('q10-op-medio-ctc').value;
      if (cel) body.Celular = cel;
      if (email) body.Correo_electronico = email;
      if (medioPub) body.Consecutivo_como_se_entero = parseInt(medioPub);
      if (medioCtc) body.Consecutivo_medio_contacto = parseInt(medioCtc);

      await sendMsg('createOportunidad', { body });
      showToast('Lead registrado en Q10 ✓', 'success');
      removeModal();
      sendMsg('clearCache').catch(() => {});
      if (state.getCurrentPhone()) handlers.searchPhone(state.getCurrentPhone());
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Registrar Lead';
    }
  });
}

function showCreateContactoModal(phone, detectedName = null) {
  if (!detectedName) detectedName = state.getCurrentContactName();
  removeModal();
  const overlay = el('div', 'q10-modal-overlay');
  const detectedFirstNames = detectedName ? detectedName.split(' ').slice(0,2).join(' ') : '';
  const detectedLastNames = detectedName && detectedName.split(' ').length > 1 ? detectedName.split(' ').slice(1).join(' ') : '';
  overlay.innerHTML = `
    <div class="q10-modal q10-modal-wide">
      <div class="q10-modal-header">
        <span class="q10-modal-title">Registrar Contacto</span>
        <button class="q10-modal-close-btn">${dom.ICONS.close}</button>
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
    const email   = document.getElementById('q10-ct-email').value.trim();
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
      if (email)      detalle.push({ Tipo_detalle: 'Email',   Descripcion: email });

      await sendMsg('createContacto', { body: {
        Consecutivo_oportunidad: 0,
        Nombres: fname,
        Apellidos: lname,
        Detalle: detalle
      }});

      showToast('Contacto registrado ✓', 'success');
      removeModal();
      sendMsg('clearCache').catch(() => {});
      if (state.getCurrentPhone()) handlers.searchPhone(state.getCurrentPhone());
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Registrar Contacto';
    }
  });
}

function showCreateActividadModal(contactData) {
  removeModal();
  const presetNegocio = contactData?.Consecutivo_negocio || contactData?.Negocio_favorito?.Consecutivo_negocio || '';
  const TIPOS_ACTIVIDAD = ['Llamada', 'WhatsApp', 'Correo', 'Nota', 'Reunión'];
  const tipoOpts = TIPOS_ACTIVIDAD.map(t => `<option value="${htmlAttr(t)}" ${t === 'WhatsApp' ? 'selected' : ''}>${htmlText(t)}</option>`).join('');
  const overlay = el('div', 'q10-modal-overlay');
  overlay.innerHTML = `
    <div class="q10-modal">
      <div class="q10-modal-header">
        <span class="q10-modal-title">Registrar Actividad</span>
        <button class="q10-modal-close-btn">${dom.ICONS.close}</button>
      </div>
      <div class="q10-modal-body">
        <div class="q10-form-group"><label class="q10-form-label">Consecutivo Negocio *</label>
          <input class="q10-form-input" id="q10-act-negocio" type="number" min="1" value="${htmlAttr(presetNegocio)}" placeholder="ID del negocio (ver oportunidad primero)">
          <div style="font-size:11px;color:#6B7280;margin-top:4px;">Cree una oportunidad en el contacto antes de registrar actividades; el ID del Primer Negocio aparece en la respuesta.</div>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Estado *</label>
          <div style="display:flex;gap:16px;margin-top:4px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;">
              <input type="radio" name="q10-act-estado" value="C" checked> Completada
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;">
              <input type="radio" name="q10-act-estado" value="P"> Programada
            </label>
          </div>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Tipo *</label>
          <select class="q10-form-select" id="q10-act-type">${tipoOpts}</select>
        </div>
        <div class="q10-form-group" id="q10-act-resultado-wrap"><label class="q10-form-label">Resultado *</label>
          <textarea class="q10-form-textarea" id="q10-act-resultado" placeholder="Resultado de la interacción (ej: cliente interesado, a pedido agendar presentación)"></textarea>
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

  overlay.querySelectorAll('input[name="q10-act-estado"]').forEach(radio => {
    radio.addEventListener('change', (ev) => {
      const isCompletada = ev.target.value === 'C';
      document.getElementById('q10-act-resultado-wrap').style.display = isCompletada ? '' : 'none';
      document.getElementById('q10-act-desc-wrap').style.display = isCompletada ? 'none' : '';
    });
  });

  document.getElementById('q10-act-submit').addEventListener('click', async () => {
    const negocio = parseInt(document.getElementById('q10-act-negocio').value, 10);
    const tipo = document.getElementById('q10-act-type').value;
    const estado = overlay.querySelector('input[name="q10-act-estado"]:checked').value;
    const resultado = document.getElementById('q10-act-resultado').value.trim();
    const desc = document.getElementById('q10-act-desc').value.trim();
    if (!negocio || Number.isNaN(negocio)) { showToast('Consecutivo negocio obligatorio', 'error'); return; }
    if (estado === 'C' && !resultado) { showToast('Resultado obligatorio para actividades completadas', 'error'); return; }
    if (estado === 'P' && !desc) { showToast('Descripción obligatoria para actividades programadas', 'error'); return; }
    const btn = document.getElementById('q10-act-submit');
    btn.disabled = true; btn.textContent = 'Registrando...';
    try {
      const body = {
        Consecutivo_negocio: negocio,
        Tipo_actividad: tipo,
        Estado_actividad: estado,
      };
      if (estado === 'C') body.Resultado_actividad = resultado;
      else body.Descripcion_actividad = desc;
      await sendMsg('createActividad', { body });
      showToast('Actividad registrada ✓', 'success');
      removeModal();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Registrar';
    }
  });
}

window.Q10SidePanel.renderer = {
  renderLoading,
  renderNoApiKey,
  renderNoConversation,
  renderError,
  renderUnknown,
  renderEstudiante,
  renderOportunidad,
  renderContacto,
  renderResult,
  renderWizardStep,
  submitWizardStep,
  renderWizardComplete,
  showGenerarCobroModal,
  showCreateOportunidadModal,
  showCreateContactoModal,
  showCreateActividadModal,
};
