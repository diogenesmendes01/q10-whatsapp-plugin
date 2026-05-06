/* ============================================================
   Q10 CRM — Wizard Module
   Enrollment wizard: 5 steps (Contacto → Estudiante → Inscripción → Matrícula → Cobro).
   ============================================================ */

import { sendMsg } from './q10Api.js';
import * as handlers from './handlers.js';
import { icon, htmlText, htmlAttr, fullNameHtml, escHtml } from './helpers.js';
import {
  wizardState, catalogsCache,
  currentPhone, currentResult,
  setWizardState
} from './state.js';
import { body, hideActions, showActions } from './renderer.js';

// Lazy alias: handlers.js imports from this module (circular dep), so resolve
// showToast through the live namespace binding at call time, not via static
// destructuring (which could capture undefined depending on eval order).
const showToast = (...a) => handlers.showToast(...a);

export const WIZARD_STEPS = [
  { id: 'contacto',    label: 'Contacto',    icon: 'user' },
  { id: 'estudiante',  label: 'Estudiante',  icon: 'userPlus' },
  { id: 'inscripcion', label: 'Inscripción', icon: 'book' },
  { id: 'matricula',   label: 'Matrícula',   icon: 'graduation' },
  { id: 'cobro',       label: 'Cobro',       icon: 'dollar' },
];

export function cancelWizard() {
  setWizardState(null);
  if (currentResult) {
    if (currentResult.type === 'estudiante') handlers.renderEstudiante(currentResult);
    else if (currentResult.type === 'contacto') handlers.renderContacto(currentResult.data || currentResult);
    else if (currentResult.type === 'oportunidad') handlers.renderOportunidad(currentResult);
    else handlers.restoreView();
  } else if (currentPhone) {
    handlers.searchPhone(currentPhone);
  } else {
    handlers.renderNoConversation();
  }
}

function wizardStepperHtml(currentStep) {
  return `
    <div class="q10-wizard-stepper">
      ${WIZARD_STEPS.map((s, i) => {
        const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
        return `
          <div class="q10-step ${state}">
            <div class="q10-step-circle">
              ${state === 'done' ? icon('check') : `<span>${i + 1}</span>`}
            </div>
            <div class="q10-step-label">${s.label}</div>
          </div>
          ${i < WIZARD_STEPS.length - 1 ? `<div class="q10-step-line ${i < currentStep ? 'done' : ''}"></div>` : ''}
        `;
      }).join('')}
    </div>
  `;
}

export function renderWizardStep() {
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
            <div class="q10-wizard-step-title">Paso 1: Crear Lead</div>
            <div class="q10-wizard-step-desc">Registramos la oportunidad y el contacto del prospecto en Q10</div>
          </div>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Primer Nombre *</label><input class="q10-form-input" id="wz-fname" value="${htmlAttr(pf.Primer_nombre)}" placeholder="Nombre"></div>
        <div class="q10-form-group"><label class="q10-form-label">Segundo Nombre</label><input class="q10-form-input" id="wz-fname2" value="${htmlAttr(pf.Segundo_nombre)}" placeholder="Segundo nombre"></div>
        <div class="q10-form-group"><label class="q10-form-label">Primer Apellido *</label><input class="q10-form-input" id="wz-lname" value="${htmlAttr(pf.Primer_apellido)}" placeholder="Apellido"></div>
        <div class="q10-form-group"><label class="q10-form-label">Segundo Apellido</label><input class="q10-form-input" id="wz-lname2" value="${htmlAttr(pf.Segundo_apellido)}" placeholder="Segundo apellido"></div>
        <div class="q10-form-group"><label class="q10-form-label">Número de Identificación *</label><input class="q10-form-input" id="wz-docnum" value="${htmlAttr(pf.Numero_identificacion)}" placeholder="CPF / Cédula / Pasaporte"></div>
        <div class="q10-form-group"><label class="q10-form-label">Email</label><input class="q10-form-input" id="wz-email" type="email" value="${htmlAttr(pf.Email)}" placeholder="email@ejemplo.com"></div>
        <div class="q10-form-group"><label class="q10-form-label">Celular</label><input class="q10-form-input" id="wz-phone" value="${htmlAttr(wizardState.phone)}" placeholder="+502 4512-3489"></div>
      `;
      break;

    case 1: {
      const doctypeOpts = (catalogsCache?.tiposIdentificacion || [])
        .map(t => `<option value="${htmlAttr(t.Codigo)}">${htmlText(t.Nombre)} (${htmlText(t.Abreviatura || t.Codigo)})</option>`)
        .join('');
      const genderOpts = (catalogsCache?.sexos || [])
        .map(s => `<option value="${htmlAttr(s.Codigo_sexo)}">${htmlText(s.Nombre_sexo)}</option>`)
        .join('');
      const progOpts = (catalogsCache?.programas || [])
        .map(p => `<option value="${htmlAttr(p.Codigo)}">${htmlText(p.Nombre || p.Codigo)}</option>`)
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
            <option value="">— Seleccionar programa —</option>${progOpts || '<option value="" disabled>No hay programas</option>'}
          </select>
        </div>
        <div class="q10-form-group"><label class="q10-form-label">Observaciones</label><textarea class="q10-form-textarea" id="wz-est-obs" placeholder="Notas adicionales..."></textarea></div>
      `;
      break;
    }

    case 2: {
      const preselectedProg = res.estudiante?.Codigo_programa_inicial;
      const programasOpts = (catalogsCache?.programas || [])
        .map(p => `<option value="${htmlAttr(p.Codigo)}" ${p.Codigo === preselectedProg ? 'selected' : ''}>${htmlText(p.Nombre || p.Codigo)}</option>`)
        .join('');
      const periodosOpts = (catalogsCache?.periodos || [])
        .map(p => `<option value="${htmlAttr(p.Consecutivo)}">${htmlText(p.Nombre || p.Consecutivo)}</option>`)
        .join('');
      const jornadaOpts = (catalogsCache?.jornadas || [])
        .map(j => `<option value="${htmlAttr(j.Codigo)}">${htmlText(j.Nombre)}</option>`)
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
      const progName = catalogsCache?.programas?.find(p => p.Codigo === res.inscripcion?.Codigo_programa)?.Nombre || res.inscripcion?.Codigo_programa || '—';
      const perName = catalogsCache?.periodos?.find(p => p.Consecutivo === res.inscripcion?.Consecutivo_periodo)?.Nombre || res.inscripcion?.Consecutivo_periodo || '—';
      const nivelOpts = (catalogsCache?.niveles || [])
        .map(n => `<option value="${htmlAttr(n.Codigo_nivel)}">${htmlText(n.Nombre_nivel)}</option>`)
        .join('');
      const sedejornadaOpts = (catalogsCache?.sedesjornadas || [])
        .map(sj => `<option value="${htmlAttr(sj.Consecutivo)}">${htmlText(sj.Sede_jornada || ((sj.Nombre_sede || '') + ' - ' + (sj.Nombre_jornada || '')))}</option>`)
        .join('');
      const condicionOpts = (catalogsCache?.condicionesMatricula || [])
        .map(c => `<option value="${htmlAttr(c.Codigo)}">${htmlText(c.Nombre)}</option>`)
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
    document.getElementById('wz-cancel').addEventListener('click', () => cancelWizard());
  } else {
    document.getElementById('wz-back').addEventListener('click', () => { wizardState.step--; renderWizardStep(); });
  }
  document.getElementById('wz-next').addEventListener('click', submitWizardStep);
}

export async function submitWizardStep() {
  const step = wizardState.step;
  const btn = document.getElementById('wz-next');
  const res = wizardState.results;

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
        const fullName = [fname, fname2, lname, lname2].filter(Boolean).join(' ');

        // Q10 forces every contacto to belong to an oportunidad
        // (POST /contactos with Consecutivo_oportunidad=0 returns 404, omitted returns 400).
        // Reuse one if the wizard was started from an existing oportunidad row,
        // or if a prior attempt on this step already created one (avoid duplicates on retry).
        let consecOportunidad = res.oportunidad?.Consecutivo_oportunidad
          ?? res.oportunidad?.Consecutivo
          ?? wizardState.prefill?.Consecutivo_oportunidad
          ?? wizardState.prefill?.Consecutivo;

        if (!consecOportunidad) {
          const oppPayload = {
            Nombre_oportunidad: fullName,
            Numero_identificacion_oportunidad: wzDocnum,
          };
          if (wzCelularQ10) oppPayload.Celular = wzCelularQ10;
          if (wzEmail) oppPayload.Correo_electronico = wzEmail;

          let oppResult;
          try {
            oppResult = await sendMsg('createOportunidad', { body: oppPayload });
          } catch (e) {
            const msg = e.message || '';
            if (/no se encuentra registrado un asesor/i.test(msg)) {
              throw new Error('El asesor configurado en las Opciones no está registrado como asesor en Q10. Vaya a Q10 → Mercadeo → Asesores y regístrelo, o cambie el asesor en las Opciones de la extensión.');
            }
            throw e;
          }
          res.oportunidad = oppResult;
          consecOportunidad = oppResult.Consecutivo_oportunidad ?? oppResult.Consecutivo;
          if (!consecOportunidad) {
            throw new Error('La API no devolvió un Consecutivo de oportunidad. No es posible continuar.');
          }
        }

        const payload = {
          Consecutivo_oportunidad: consecOportunidad,
          Nombres: [fname, fname2].filter(Boolean).join(' '),
          Apellidos: [lname, lname2].filter(Boolean).join(' '),
          Detalle: wzDetalle,
        };
        const result = await sendMsg('createContacto', { body: payload });
        res.contacto = {
          ...payload,
          ...result,
          Primer_nombre: fname,
          Segundo_nombre: fname2 || null,
          Primer_apellido: lname,
          Segundo_apellido: lname2 || null,
          Email: wzEmail,
          Celular: wzCelularQ10,
          Numero_identificacion: wzDocnum,
        };
        showToast('Lead creado ✓', 'success');
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
    wizardState.step++;
    renderWizardStep();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    const isLast = step === WIZARD_STEPS.length - 1;
    btn.innerHTML = isLast ? `${icon('check','q10-btn-icon')} Finalizar` : `Siguiente ${icon('arrowRight','q10-btn-icon')}`;
  }
}

export function renderWizardComplete() {
  const res = wizardState.results;
  const progName = catalogsCache?.programas?.find(p => p.Codigo === res.inscripcion?.Codigo_programa)?.Nombre || '—';

  body().innerHTML = `
    ${wizardStepperHtml(5)}
    <div class="q10-state" style="padding:24px 16px;">
      <div style="width:64px;height:64px;background:#D1FAE5;border-radius:50%;display:flex;align-items:center;justify-content:center;">
        <span style="color:#065F46;width:32px;height:32px;">${icon('check')}</span>
      </div>
      <div class="q10-state-title" style="color:#065F46;">¡Matrícula Completa!</div>
      <div class="q10-state-text">El proceso de matrícula se completó exitosamente.</div>
    </div>
    <div class="q10-section">
      <div class="q10-section-title">Resumen</div>
      <div class="q10-info-card">
        <div class="q10-info-row"><span class="q10-info-label">Alumno</span><span class="q10-info-value">${fullNameHtml(res.contacto)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Programa</span><span class="q10-info-value">${htmlText(progName)}</span></div>
        <div class="q10-info-row"><span class="q10-info-label">Estado</span><span class="q10-info-value"><span class="q10-badge q10-badge-green">${htmlText(res.matricula?.Estado, 'Activo')}</span></span></div>
        ${res.cobro ? `<div class="q10-info-row"><span class="q10-info-label">Cobro</span><span class="q10-info-value">${res.cobro.Valor ? escHtml('$ ' + Number(res.cobro.Valor).toLocaleString('es-CO', { minimumFractionDigits: 0 })) : '—'}</span></div>` : ''}
      </div>
    </div>
  `;

  showActions(`
    <button class="q10-btn q10-btn-primary" id="wz-finish" style="flex:1;">${icon('search','q10-btn-icon')} Ver Alumno</button>
    <button class="q10-btn q10-btn-outline" id="wz-new" style="flex:1;">${icon('plus','q10-btn-icon')} Nueva Matrícula</button>
  `);

  document.getElementById('wz-finish').addEventListener('click', () => {
    setWizardState(null);
    sendMsg('clearCache').catch(() => {});
    if (currentPhone) handlers.searchPhone(currentPhone);
  });
  document.getElementById('wz-new').addEventListener('click', () => {
    const phone = wizardState.phone;
    setWizardState(null);
    startEnrollmentWizard(phone);
  });
}