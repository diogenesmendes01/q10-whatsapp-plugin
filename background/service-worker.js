/* ============================================================
   Q10 CRM — Background Service Worker
   Handles API calls + Side Panel management + phone relay.
   v2.3 — Real Q10 API (no mocks)
   ============================================================ */

const API_BASE = 'https://geniusidiomas.com/api/q10';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_SHORT = 60 * 1000; // 1 min for financial data

// In-memory cache
const cache = new Map();

function cacheKey(endpoint, params) {
  return `${endpoint}|${JSON.stringify(params || {})}`;
}

function getCached(key, ttl) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > (ttl || CACHE_TTL)) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ---------- Side Panel setup ----------

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ---------- API helpers ----------

async function getApiKey() {
  const result = await chrome.storage.sync.get(['q10ApiKey']);
  return result.q10ApiKey || null;
}

async function getAsesorId() {
  const result = await chrome.storage.sync.get(['q10AsesorId']);
  return result.q10AsesorId || null;
}

async function apiGet(endpoint, params = {}, opts = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API key não configurada. Configure a chave Q10 nas opções da extensão.');

  const key = cacheKey(endpoint, params);
  const ttl = opts.shortCache ? CACHE_TTL_SHORT : CACHE_TTL;
  if (!opts.noCache) {
    const cached = getCached(key, ttl);
    if (cached) return cached;
  }

  const query = new URLSearchParams({ Limit: '1000', Offset: '1', ...params }).toString();
  const url = `${API_BASE}${endpoint}?${query}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Q10-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status}: ${text || resp.statusText}`);
  }

  const data = await resp.json();
  setCache(key, data);
  return data;
}

async function apiPost(endpoint, body) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API key não configurada. Configure a chave Q10 nas opções da extensão.');

  const url = `${API_BASE}${endpoint}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Q10-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status}: ${text || resp.statusText}`);
  }

  return resp.json();
}

// ---------- Phone normalization ----------

function normalizePhone(raw) {
  let digits = (raw || '').replace(/\D/g, '');
  // Remove leading 0 (local format)
  if (digits.startsWith('0') && digits.length <= 11) digits = digits.slice(1);
  return digits;
}

function phoneMatches(contactPhone, searchPhone) {
  const a = normalizePhone(contactPhone);
  const b = normalizePhone(searchPhone);
  if (!a || !b) return false;
  // Exact match
  if (a === b) return true;
  // One contains the other (handles country code differences)
  if (a.endsWith(b) || b.endsWith(a)) return true;
  // Last 8 digits match (handles varying country code + area code formats)
  if (a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8)) return true;
  return false;
}

// ---------- Name matching ----------

function nameMatches(record, searchName) {
  if (!searchName) return false;
  const search = searchName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Build full name from record fields
  // Last 9 digits match (avoids false positives for Brazilian numbers where
  // different area codes (e.g. 11 vs 21) can share the same last 8 digits.
  // Brazilian mobiles are 10 digits (0XX + 9XXXXXXXX) and landlines are 9 digits
  // (0XX + XXXXXXXX) after stripping leading 0; requiring 9 digits distinguishes them.)
  if (a.length >= 9 && b.length >= 9 && a.slice(-9) === b.slice(-9)) return true;
  return false;
    record.Primer_apellido, record.Segundo_apellido,
    record.Nombre, record.nombre,
    record.Nombre_completo
  ].filter(Boolean);
  
  const fullName = parts.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  if (!fullName) return false;
  
  // Exact match
  if (fullName === search) return true;
  
  // Full name contains search or search contains full name
  if (fullName.includes(search) || search.includes(fullName)) return true;
  
  // Match by parts: all search words must appear in the full name
  const searchWords = search.split(/\s+/).filter(w => w.length > 1);
  const nameWords = fullName.split(/\s+/);
  const allMatch = searchWords.every(sw => nameWords.some(nw => nw.includes(sw) || sw.includes(nw)));
  
  return allMatch && searchWords.length > 0;
}

// ---------- Search logic ----------

async function searchByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 8) {
    throw new Error('Número de telefone inválido.');
  }
  return searchContacts({ phone: normalized });
}

async function searchByName(name) {
  if (!name || name.length < 2) {
    throw new Error('Nombre demasiado corto.');
  }
  return searchContacts({ name });
}

async function searchContacts({ phone, name }) {
  const results = { type: 'unknown', phone: phone || null, name: name || null, data: null };

  const matchFn = (record) => {
    if (phone) {
      return phoneMatches(record.Telefono, phone) || phoneMatches(record.Celular, phone);
    }
    if (name) {
      return nameMatches(record, name);
    }
    return false;
  };

  // 1. Search usuarios (alunos/estudantes)
  try {
    const usuarios = await apiGet('/usuarios');
    if (Array.isArray(usuarios)) {
      const match = usuarios.find(matchFn);
      if (match) {
        results.type = 'estudiante';
        results.data = match;

        try {
          const estado = await apiGet('/estadocuentaestudiantes', {}, { shortCache: true });
          if (Array.isArray(estado)) {
            results.estadoCuenta = estado.find(e =>
              e.Codigo_estudiante === match.Codigo || e.Codigo === match.Codigo
            ) || null;
          }
        } catch (_) {}

        return results;
      }
    }
  } catch (e) {
    console.warn('[Q10] Error searching usuarios:', e.message);
  }

  // 2. Search contactos
  try {
    const contactos = await apiGet('/contactos');
    if (Array.isArray(contactos)) {
      const match = contactos.find(matchFn);
      if (match) {
        results.type = 'contacto';
        results.data = match;
        return results;
      }
    }
  } catch (e) {
    console.warn('[Q10] Error searching contactos:', e.message);
  }

  return results;
}

// ---------- Fetch catalogs ----------

async function fetchCatalogs() {
  const [programas, periodos, sedes, jornadas, sedesjornadas, niveles, tiposIdent, sexos, condicionesMat, mediospublicitarios, medioscontacto] = await Promise.all([
    apiGet('/programas').catch((e) => { console.warn('[Q10] /programas failed:', e.message); return []; }),
    apiGet('/periodos').catch((e) => { console.warn('[Q10] /periodos failed:', e.message); return []; }),
    apiGet('/sedes').catch((e) => { console.warn('[Q10] /sedes failed:', e.message); return []; }),
    apiGet('/jornadas').catch((e) => { console.warn('[Q10] /jornadas failed:', e.message); return []; }),
    apiGet('/sedesjornadas').catch((e) => { console.warn('[Q10] /sedesjornadas failed:', e.message); return []; }),
    apiGet('/niveles', { Estado: true }).catch((e) => { console.warn('[Q10] /niveles failed:', e.message); return []; }),
    apiGet('/tiposidentificacion').catch((e) => { console.warn('[Q10] /tiposidentificacion failed:', e.message); return []; }),
    apiGet('/sexos').catch((e) => { console.warn('[Q10] /sexos failed:', e.message); return []; }),
    apiGet('/condicionesMatricula', { Estado: true }).catch((e) => { console.warn('[Q10] /condicionesMatricula failed:', e.message); return []; }),
    apiGet('/mediospublicitarios', { Estado: true }).catch((e) => { console.warn('[Q10] /mediospublicitarios failed:', e.message); return []; }),
    apiGet('/medioscontacto', { Estado: true }).catch((e) => { console.warn('[Q10] /medioscontacto failed:', e.message); return []; })
  ]);
  return {
    programas: Array.isArray(programas) ? programas : [],
    periodos: Array.isArray(periodos) ? periodos : [],
    sedes: Array.isArray(sedes) ? sedes : [],
    jornadas: Array.isArray(jornadas) ? jornadas : [],
    sedesjornadas: Array.isArray(sedesjornadas) ? sedesjornadas : [],
    niveles: Array.isArray(niveles) ? niveles : [],
    tiposIdentificacion: Array.isArray(tiposIdent) ? tiposIdent : [],
    sexos: Array.isArray(sexos) ? sexos : [],
    condicionesMatricula: Array.isArray(condicionesMat) ? condicionesMat : [],
    mediospublicitarios: Array.isArray(mediospublicitarios) ? mediospublicitarios : [],
    medioscontacto: Array.isArray(medioscontacto) ? medioscontacto : []
  };
}

// ---------- Fetch student financials ----------

async function fetchStudentFinancials(codigoEstudiante) {
  // Note: /pagos and /pagosPendientes not available in this Q10 plan
  // Only estadocuentaestudiantes is available
  try {
    const estado = await apiGet('/estadocuentaestudiantes', {}, { shortCache: true, noCache: true });
    const estadoCuenta = Array.isArray(estado)
      ? estado.find(e => e.Codigo_estudiante === codigoEstudiante || e.Codigo === codigoEstudiante) || null
      : null;
    return { estadoCuenta, pagosPendientes: [], pagosRealizados: [] };
  } catch (_) {
    return { estadoCuenta: null, pagosPendientes: [], pagosRealizados: [] };
  }
}

// ---------- Message handler ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = (promise) => {
    promise
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  };

  switch (msg.action) {
    case 'openSidePanel':
      (async () => {
        try {
          const window = await chrome.windows.getCurrent();
          await chrome.sidePanel.open({ windowId: window.id });
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;

    case 'phoneChanged':
      // Store both phone and name in session storage
      chrome.storage.session.set({
        currentPhone: msg.phone || null,
        currentContactName: msg.contactName || null
      });
      sendResponse({ ok: true });
      return false;

    case 'searchPhone':
      return handle(searchByPhone(msg.phone));

    case 'searchName':
      return handle(searchByName(msg.name));

    case 'fetchCatalogs':
      return handle(fetchCatalogs());

    case 'fetchStudentFinancials':
      return handle(fetchStudentFinancials(msg.codigoEstudiante));

    case 'createContacto':
      return handle(apiPost('/contactos', msg.body));

    case 'createEstudiante':
      // BUG-02 fix: POST /estudiantes (not /usuarios). Schema: Primer_nombre, Primer_apellido,
      // Codigo_tipo_identificacion, Numero_identificacion, Genero, Email, Celular,
      // Fecha_nacimiento, Codigo_programa (all required per live API validation).
      return handle(apiPost('/estudiantes', msg.body));

    case 'createInscripcion':
      return handle(apiPost('/inscripciones', msg.body));

    case 'createMatricula':
      // BUG-04 fix: POST /matriculasProgramas. Schema requires: Consecutivo_inscripcion,
      // Codigo_estudiante, Fecha_matricula, Consecutivo_sede_jornada, Consecutivo_periodo,
      // Codigo_nivel, Condicion_matricula (enum — value from Q10 UI), Formalizada (bool).
      return handle(apiPost('/matriculasProgramas', msg.body));

    case 'createOrdenPago':
      // BUG-06: /ordenespago returns 400 "La API no aplica para el modelo financiero de la
      // institución" on tenants without finance module. The sidepanel detects this error
      // and shows a friendly message instead of crashing.
      return handle(apiPost('/ordenespago', msg.body));

    case 'createOportunidad':
      return handle((async () => {
        const body = { ...msg.body };
        if (!body.Numero_identificacion_asesor) {
          const asesorId = await getAsesorId();
          if (asesorId) body.Numero_identificacion_asesor = asesorId;
        }
        return apiPost('/oportunidades', body);
      })());

    case 'fetchMedios':
      return handle(Promise.all([
        apiGet('/mediospublicitarios', { Estado: true }).catch(() => []),
        apiGet('/medioscontacto', { Estado: true }).catch(() => [])
      ]).then(([pub, ctc]) => ({ mediospublicitarios: pub, medioscontacto: ctc })));

    case 'createActividad':
      // BUG-03 fix: POST /actividades expects Consecutivo_negocio, Estado_actividad,
      // Tipo_actividad, Numero_identificacion_asesor, Fecha_actividad. Asesor ID is
      // auto-injected from storage if not provided in body.
      return handle((async () => {
        const body = { ...msg.body };
        if (!body.Numero_identificacion_asesor) {
          const asesorId = await getAsesorId();
          if (asesorId) body.Numero_identificacion_asesor = asesorId;
        }
        if (!body.Fecha_actividad) {
          body.Fecha_actividad = new Date().toISOString().split('T')[0];
        }
        return apiPost('/actividades', body);
      })());

    case 'getAsesorId':
      return handle(getAsesorId().then(id => ({ asesorId: id })));

    case 'fetchAdministrativos':
      // Used by options page to populate the asesor dropdown. Cached 5 min via apiGet.
      return handle(apiGet('/administrativos'));

    case 'exportAll':
      return handle((async () => {
        const [contactos, usuarios] = await Promise.all([
          apiGet('/contactos').catch(() => []),
          apiGet('/usuarios').catch(() => [])
        ]);
        return { contactos, estudiantes: usuarios };
      })());

    case 'exportConversation':
      // Forward to content script in active WhatsApp tab
      (async () => {
        try {
          const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*', active: true });
          if (!tabs.length) {
            sendResponse({ ok: false, error: 'WhatsApp Web no encontrado' });
            return;
          }
          chrome.tabs.sendMessage(tabs[0].id, { action: 'exportConversation' }, (resp) => {
            sendResponse(resp || { ok: false, error: 'Sin respuesta' });
          });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;

    case 'checkApiKey':
      return handle(
        getApiKey().then(key => ({ configured: key !== null && key !== '' }))
      );

    case 'clearCache':
      cache.clear();
      sendResponse({ ok: true });
      return false;

    default:
      sendResponse({ ok: false, error: `Unknown action: ${msg.action}` });
      return false;
  }
});
