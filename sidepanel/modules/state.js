/* ============================================================
   Q10 CRM — Side Panel
   Module: State
   v3.0
   ============================================================ */

window.Q10SidePanel = window.Q10SidePanel || {};

const { ICONS } = window.Q10SidePanel;

// Module-level state variables
let currentPhone = null;
let currentContactName = null;
let currentResult = null;
let wizardState = null;
let catalogsCache = null;

const WIZARD_STEPS = [
  { id: 'contacto',    label: 'Contacto',    icon: 'user' },
  { id: 'estudiante',  label: 'Estudiante',  icon: 'userPlus' },
  { id: 'inscripcion', label: 'Inscripción', icon: 'book' },
  { id: 'matricula',   label: 'Matrícula',   icon: 'graduation' },
  { id: 'cobro',       label: 'Cobro',       icon: 'dollar' },
];

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

window.Q10SidePanel.state = {
  // Getters
  getCurrentPhone: () => currentPhone,
  getCurrentContactName: () => currentContactName,
  getCurrentResult: () => currentResult,
  getWizardState: () => wizardState,
  getCatalogsCache: () => catalogsCache,

  // Setters
  setCurrentPhone: (v) => { currentPhone = v; },
  setCurrentContactName: (v) => { currentContactName = v; },
  setCurrentResult: (v) => { currentResult = v; },
  setWizardState: (v) => { wizardState = v; },
  setCatalogsCache: (v) => { catalogsCache = v; },

  // Constants
  WIZARD_STEPS,
  AVAILABLE_TAGS,
};
