/* ============================================================
   Q10 CRM — Side Panel
   Module: API Calls
   v3.0
   ============================================================ */

window.Q10SidePanel = window.Q10SidePanel || {};

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

async function fetchStudentFinancials(codigoEstudiante) {
  return sendMsg('fetchStudentFinancials', { codigoEstudiante });
}

window.Q10SidePanel.api = {
  sendMsg,
  exportAllData,
  exportConversation,
  generateCSV,
  downloadCSV,
  fetchStudentFinancials,
};
