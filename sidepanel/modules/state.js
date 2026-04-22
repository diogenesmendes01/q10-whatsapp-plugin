/* ============================================================
   Q10 CRM — State Module
   Application-level mutable state.
   ============================================================ */

export let currentPhone = null;
export let currentContactName = null;
export let currentResult = null;
export let wizardState = null;
export let catalogsCache = null;

export const AVAILABLE_TAGS = [
  { id: 'interested', label: 'Interesado', color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'enrolled', label: 'Matriculado', color: '#10B981', bg: '#ECFDF5' },
  { id: 'active', label: 'Activo', color: '#059669', bg: '#D1FAE5' },
  { id: 'inactive', label: 'Inactivo', color: '#6B7280', bg: '#F3F4F6' },
  { id: 'overdue', label: 'Mora', color: '#EF4444', bg: '#FEF2F2' },
  { id: 'vip', label: 'VIP', color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'referral', label: 'Referido', color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'prospect', label: 'Prospecto', color: '#EC4899', bg: '#FDF2F8' },
];

export async function getContactTags(contactId) {
  return new Promise(resolve => {
    chrome.storage.local.get(['tags_' + contactId], (result) => {
      resolve(result['tags_' + contactId] || []);
    });
  });
}

export async function setContactTags(contactId, tags) {
  return new Promise(resolve => {
    chrome.storage.local.set({ ['tags_' + contactId]: tags }, resolve);
  });
}

export async function getContactNotes(contactId) {
  return new Promise(resolve => {
    chrome.storage.local.get(['notes_' + contactId], (result) => {
      resolve(result['notes_' + contactId] || []);
    });
  });
}

export async function addContactNote(contactId, text) {
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

export async function deleteContactNote(contactId, noteId) {
  let notes = await getContactNotes(contactId);
  notes = notes.filter(n => n.id !== noteId);
  return new Promise(resolve => {
    chrome.storage.local.set({ ['notes_' + contactId]: notes }, resolve);
  });
}