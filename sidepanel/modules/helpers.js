/* ============================================================
   Q10 CRM — Helpers Module
   Pure utility functions: HTML escaping, formatting, DOM builders.
   No side effects, no chrome APIs.
   ============================================================ */

export const ICONS = {
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

// Escape API-sourced strings before interpolating into innerHTML templates.
// Q10 catálogos (administrativos, programas, etc.) traen nombres configurados por el
// cliente — sin escape, un nombre con `<` / `"` quebra o DOM o abre XSS.
export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function htmlText(value, fallback = '\u2014') {
  const text = value === undefined || value === null || value === '' ? fallback : value;
  return escHtml(text);
}

export function htmlAttr(value) {
  return escHtml(value === undefined || value === null ? '' : value);
}

export function fullName(d) {
  if (!d) return '—';
  return [d.Primer_nombre, d.Segundo_nombre, d.Primer_apellido, d.Segundo_apellido]
    .filter(Boolean).join(' ');
}

export function fullNameHtml(d) {
  return htmlText(fullName(d));
}

// Split a free-form full name into Q10's four-field shape using a simple
// Hispanic/Brazilian heuristic. The user can always tweak the form fields
// after, so we optimize for "good enough" not "always correct".
//   1 token  → Primer_nombre
//   2 tokens → Primer_nombre + Primer_apellido
//   3 tokens → Primer_nombre + Primer_apellido + Segundo_apellido (Hispanic)
//   4+       → Primer_nombre + Segundo_nombre + Primer_apellido + (rest as Segundo_apellido)
export function parseFullName(str) {
  const parts = String(str || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { Primer_nombre: parts[0] };
  if (parts.length === 2) return { Primer_nombre: parts[0], Primer_apellido: parts[1] };
  if (parts.length === 3) {
    return { Primer_nombre: parts[0], Primer_apellido: parts[1], Segundo_apellido: parts[2] };
  }
  return {
    Primer_nombre: parts[0],
    Segundo_nombre: parts[1],
    Primer_apellido: parts[2],
    Segundo_apellido: parts.slice(3).join(' '),
  };
}

// Coerce wizard prefill into the canonical { Primer_nombre, Segundo_nombre,
// Primer_apellido, Segundo_apellido, Numero_identificacion, Email, Celular }
// shape the wizard form expects. Accepts a plain string (WhatsApp-detected
// name), a Q10 contacto/oportunidad ({ Nombres, Apellidos, ... }), or an
// estudiante record (already canonical) — and merges so existing canonical
// fields win over derived ones.
export function normalizeWizardPrefill(input) {
  if (!input) return {};
  if (typeof input === 'string') return parseFullName(input);
  if (input.Primer_nombre || input.Primer_apellido) return { ...input };
  const fullStr = [input.Nombres, input.Apellidos].filter(Boolean).join(' ').trim();
  if (!fullStr) return { ...input };
  return { ...input, ...parseFullName(fullStr) };
}

// Normalize a free-form phone string into the format Q10 expects on its
// `Celular` columns. Q10 caps Detalle.Descripcion at 12 digits and most of
// the LATAM tenants store local-format numbers (no country code) so we
// detect known LATAM country codes and strip them when needed. If we can't
// confidently identify the country, fall back to keeping the last 12 digits.
//
// Known prefixes (longest first; ITU E.164 region 5xx is LATAM):
//   1-digit: 1 (US/CA — uncommon for LATAM CRMs but supported)
//   2-digit: 51 PE, 52 MX, 53 CU, 54 AR, 55 BR, 56 CL, 57 CO, 58 VE
//   3-digit: 501-509 Central America + Caribbean (BZ/GT/SV/HN/NI/CR/PA/HT/DO),
//            591 BO, 592 GY, 593 EC, 595 PY, 597 SR, 598 UY
const LATAM_CC = {
  3: ['501','502','503','504','505','506','507','508','509','591','592','593','595','597','598'],
  2: ['51','52','53','54','55','56','57','58'],
  1: ['1'],
};

export function normalizeLatamPhone(raw, opts = {}) {
  const max = opts.max ?? 12;
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= max) return digits;

  for (const ccLen of [3, 2, 1]) {
    for (const cc of LATAM_CC[ccLen]) {
      if (digits.startsWith(cc)) {
        const local = digits.slice(ccLen);
        // A valid local number is 7-11 digits (e.g. BR mobile 11, US 10,
        // CR 8). Skip if stripping would leave something unreasonably
        // short (would mean the prefix coincidentally matched).
        if (local.length >= 7 && local.length <= 11) return local;
      }
    }
  }
  return digits.slice(-max);
}

export function fmtMoney(v) {
  return escHtml('$ ' + Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 }));
}

export function fmtDate(dateVal) {
  if (!dateVal) return '';
  return escHtml(new Date(dateVal).toLocaleDateString('es'));
}

export function formatPhone(raw) {
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

export function icon(name, cls) {
  return `<span class="${cls || ''}">${ICONS[name] || ''}</span>`;
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}