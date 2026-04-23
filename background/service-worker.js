/* ============================================================
   Q10 CRM — Background Service Worker
   Handles API calls + Side Panel management + phone relay.
   v2.3 — Real Q10 API (no mocks)
   ============================================================ */

// Default API base — overridable per tenant via options page
const DEFAULT_API_BASE = 'https://geniusidiomas.com/api/q10';
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

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

// ---------- Side Panel setup ----------

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ---------- API base URL (tenant-configurable) ----------

let apiBaseUrl = null; // cached in memory after first load

async function getApiBaseUrl() {
  if (apiBaseUrl) return apiBaseUrl;
  const result = await chrome.storage.local.get(['apiBaseUrl']);
  apiBaseUrl = (result.apiBaseUrl || '').trim() || DEFAULT_API_BASE;
  return apiBaseUrl;
}

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

  const base = await getApiBaseUrl();
  const query = new URLSearchParams({ Limit: '1000', Offset: '1', ...params }).toString();
  const url = `${base}${endpoint}?${query}`;

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

  const base = await getApiBaseUrl();
  const url = `${base}${endpoint}`;
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
  // Last 9 digits match (avoids false positives for Brazilian numbers where
  // different area codes (e.g. 11 vs 21) can share the same last 8 digits.
  // Brazilian mobiles are 10 digits (0XX + 9XXXXXXXX) and landlines are 9 digits
  // (0XX + XXXXXXXX) after stripping leading 0; requiring 9 digits distinguishes them.)
  if (a.length >= 9 && b.length >= 9 && a.slice(-9) === b.slice(-9)) return true;
  return false;
}

// ---------- Name matching ----------

function nameMatches(record, searchName) {
  if (!searchName) return false;
  const search = searchName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const parts = [
    record.Primer_nombre,
    record.Primer_apellido, record.Segundo_apellido,
    record.Nombre, record.nombre,
    record.Nombre_completo
  ].filter(Boolean);
  const fullName = parts.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!fullName) return false;
  if (fullName === search) return true;
  if (fullName.includes(search) || search.includes(fullName)) return true;
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
    const _usuarios = normalizeList(usuarios);
    {
      const match = _usuarios.find(matchFn);
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
    const _contactos = normalizeList(contactos);
    {
      const match = _contactos.find(matchFn);
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
    programas: normalizeList(programas),
    periodos: normalizeList(periodos),
    sedes: normalizeList(sedes),
    jornadas: normalizeList(jornadas),
    sedesjornadas: normalizeList(sedesjornadas),
    niveles: normalizeList(niveles),
    tiposIdentificacion: normalizeList(tiposIdent),
    sexos: normalizeList(sexos),
    condicionesMatricula: normalizeList(condicionesMat),
    mediospublicitarios: normalizeList(mediospublicitarios),
    medioscontacto: normalizeList(medioscontacto)
  };
}

// ---------- Fetch student financials ----------

async function fetchStudentFinancials(codigoEstudiante) {
  // Note: /pagos and /pagosPendientes not available in this Q10 plan
  // Only estadocuentaestudiantes is available
  try {
    const estado = await apiGet('/estadocuentaestudiantes', {}, { shortCache: true, noCache: true });
    const estadoCuenta = normalizeList(estado).find(
      e => e.Codigo_estudiante === codigoEstudiante || e.Codigo === codigoEstudiante
    ) || null;
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
        const today = new Date().toISOString().split('T')[0];
        const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
        const [contactos, usuarios, oportunidades] = await Promise.all([
          apiGet('/contactos').catch(() => []),
          apiGet('/usuarios').catch(() => []),
          apiGet('/oportunidades', { Fecha_inicio: yearAgo, Fecha_fin: today }).catch(() => [])
        ]);
        return {
          contactos: normalizeList(contactos),
          estudiantes: normalizeList(usuarios),
          oportunidades: normalizeList(oportunidades)
        };
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

    // ── Batch leads: forward start/stop to content script ──────────────
    case 'batchExtractStart':
    case 'batchExtractStop':
      (async () => {
        try {
          const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
          if (!tabs.length) {
            sendResponse({ ok: false, error: 'WhatsApp Web não encontrado' });
            return;
          }
          chrome.tabs.sendMessage(tabs[0].id, { action: msg.action, cutoffMs: msg.cutoffMs || null }, (resp) => {
            sendResponse(resp || { ok: true });
          });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;

    // ── Batch leads: relay progress/complete from content script to sidepanel ──
    case 'batchExtractProgress':
    case 'batchExtractComplete':
      // Content script → service worker → sidepanel (broadcast)
      // Store in session so sidepanel can read on connect
      try {
        chrome.storage.session.set({
          batchExtractStatus: {
            action: msg.action,
            count: msg.count || 0,
            ok: msg.ok,
            data: msg.data || null,
            error: msg.error || null,
            ts: Date.now()
          }
        });
      } catch (_) { /* chrome.storage.session unavailable (Chrome < 102) */ }
      sendResponse({ ok: true });
      return false;

    // ── Batch leads: import CSV contacts to Q10 ──────────────────────────
    case 'batchImportContacts':
      return handle((async () => {
        const contacts = msg.contacts || [];
        const results = [];
        for (const c of contacts) {
          try {
            const nameParts = (c.name || '').trim().split(/\s+/);
            const firstName = nameParts[0] || 'Contato';
            const lastName = nameParts.slice(1).join(' ') || 'WhatsApp';
            const phone = (c.phone || '').replace(/\D/g, '');
            const body = {
              Nombres: firstName,
              Apellidos: lastName,
              Detalle: [{ Tipo: 'Celular', Valor: phone }]
            };
            await apiPost('/contactos', body);
            results.push({ phone, ok: true });
          } catch (e) {
            results.push({ phone: c.phone, ok: false, error: e.message });
          }
        }
        const ok = results.filter(r => r.ok).length;
        const fail = results.filter(r => !r.ok).length;
        return { results, summary: { ok, fail } };
      })());

    default:
      sendResponse({ ok: false, error: `Unknown action: ${msg.action}` });
      return false;
  }
});
