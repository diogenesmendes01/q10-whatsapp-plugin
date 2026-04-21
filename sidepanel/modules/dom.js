/* ============================================================
   Q10 CRM — Side Panel
   Module: DOM Utilities
   v3.0
   ============================================================ */

window.Q10SidePanel = window.Q10SidePanel || {};
const { ICONS } = window.Q10SidePanel;

// Escape API-sourced strings before interpolating into innerHTML templates.
// Q10 catálogos (administrativos, programas, etc.) trazem nomes configurados pelo
// cliente — sem escape, um nome com `<` / `"` quebra o DOM ou abre XSS.
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlText(value, fallback = '\u2014') {
  const text = value === undefined || value === null || value === '' ? fallback : value;
  return escHtml(text);
}

function htmlAttr(value) {
  return escHtml(value === undefined || value === null ? '' : value);
}

function fullName(d) {
  if (!d) return '—';
  return [d.Primer_nombre, d.Segundo_nombre, d.Primer_apellido, d.Segundo_apellido]
    .filter(Boolean).join(' ');
}

function fullNameHtml(d) {
  return htmlText(fullName(d));
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function icon(name, cls) {
  return `<span class="${cls || ''}">${ICONS[name] || ''}</span>`;
}

function fmtMoney(v) {
  return '$ ' + Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 });
}

function showToast(text, type = '') {
  const existing = document.querySelector('.q10-toast');
  if (existing) existing.remove();
  const t = el('div', `q10-toast ${type ? 'q10-toast-' + type : ''}`);
  t.textContent = text || '';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function body() { return document.getElementById('q10-body'); }
function actions() { return document.getElementById('q10-actions'); }
function hideActions() { actions().style.display = 'none'; actions().innerHTML = ''; }
function showActions(html) { const a = actions(); a.style.display = 'flex'; a.innerHTML = html; }

function removeModal() {
  const existing = document.querySelector('.q10-modal-overlay');
  if (existing) existing.remove();
}

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
    <span class="q10-phone-number">${htmlText(formatPhone(phone), '')}</span>
  </div>`;
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

window.Q10SidePanel.dom = {
  escHtml,
  htmlText,
  htmlAttr,
  fullName,
  fullNameHtml,
  el,
  icon,
  fmtMoney,
  showToast,
  body,
  actions,
  hideActions,
  showActions,
  removeModal,
  formatPhone,
  phoneHtml,
  wizardStepperHtml,
};

// Re-export WIZARD_STEPS for use in dom
const { state: _state } = window.Q10SidePanel;
const WIZARD_STEPS = _state ? _state.WIZARD_STEPS : [];
