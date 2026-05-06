/* ============================================================
   Q10 CRM — Background Service Worker
   Handles API calls + Side Panel management + phone relay.
   v2.3 — Real Q10 API (no mocks)
   ============================================================ */

// Default API base — overridable per tenant via options page
const DEFAULT_API_BASE = 'https://api.q10.com/v1';
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

// Q10 oficial (Azure APIM em api.q10.com) usa header `Api-Key`.
// Proxies do tipo geniusidiomas.com/api/q10 usam `X-Q10-Key`.
// Mandar o header errado retorna 401 com mensagem do APIM ("missing subscription key").
function authHeaderFor(baseUrl) {
  return /api\.q10\.com/i.test(baseUrl) ? 'Api-Key' : 'X-Q10-Key';
}

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
      [authHeaderFor(base)]: apiKey,
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

async function apiSend(method, endpoint, body) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API key não configurada. Configure a chave Q10 nas opções da extensão.');

  const base = await getApiBaseUrl();
  const url = `${base}${endpoint}`;
  const resp = await fetch(url, {
    method,
    headers: {
      [authHeaderFor(base)]: apiKey,
      'Content-Type': 'application/json'
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status}: ${text || resp.statusText}`);
  }

  // Some endpoints (state transitions) return 204 No Content; tolerate that.
  const text = await resp.text();
  if (!text) return { ok: true };
  try { return JSON.parse(text); } catch { return text; }
}

async function apiPost(endpoint, body) { return apiSend('POST', endpoint, body); }
async function apiPatch(endpoint, body) { return apiSend('PATCH', endpoint, body); }
async function apiPut(endpoint, body) { return apiSend('PUT', endpoint, body); }

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
    record.Primer_nombre, record.Segundo_nombre,
    record.Primer_apellido, record.Segundo_apellido,
    record.Nombres, record.Apellidos,
    record.Nombre, record.nombre,
    record.Nombre_completo,
    // Oportunidades carry the lead identification under Nombre_oportunidad \u2014
    // important for falling back to name match when the list endpoint
    // doesn't return phone fields we can compare against.
    record.Nombre_oportunidad,
    record.Numero_identificacion_oportunidad,
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

async function searchByPhone(phone, name) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 8) {
    throw new Error('Número de telefone inválido.');
  }
  // Pass the WA-detected name too so /oportunidades search has a fallback
  // when Q10's list endpoint doesn't include the phone in the response shape
  // we expect — name match catches those.
  return searchContacts({ phone: normalized, name: name || null });
}

async function searchByName(name) {
  if (!name || name.length < 2) {
    throw new Error('Nombre demasiado corto.');
  }
  return searchContacts({ name });
}

async function searchContacts({ phone, name }) {
  const results = { type: 'unknown', phone: phone || null, name: name || null, data: null };

  // Match by phone first (when given), then fall back to name. Q10's list
  // endpoints sometimes return abbreviated records (no phone fields), so a
  // name fallback rescues the lookup as long as we have a name from WA.
  const matchFn = (record) => {
    if (phone && (phoneMatches(record.Telefono, phone) || phoneMatches(record.Celular, phone))) return true;
    if (name && nameMatches(record, name)) return true;
    return false;
  };

  // 1. Search /usuarios (todos os login-users: admins, pais, alunos com login).
  // /usuarios NÃO é equivalente a /estudiantes — antes do fix, qualquer match
  // aqui era rotulado 'estudiante', fazendo admin/pai aparecer como aluno.
  // Verificamos via /estudiantes/{Codigo}: 200 = aluno real, 404 = login-user
  // que não é aluno — cai pra /contactos.
  try {
    const usuarios = await apiGet('/usuarios');
    const _usuarios = normalizeList(usuarios);
    const match = _usuarios.find(matchFn);
    if (match) {
      let studentRecord = null;
      try {
        studentRecord = await apiGet(`/estudiantes/${match.Codigo}`);
      } catch (_) { /* 404 = não é aluno */ }

      if (studentRecord) {
        results.type = 'estudiante';
        results.data = studentRecord;

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
      // Match em /usuarios mas não é aluno — segue para /contactos.
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

  // 3. Search oportunidades. /oportunidades requires Fecha_inicio +
  // Fecha_fin filters; cover the last 2 years which is enough for active
  // leads. We also pull the related negocios + recent actividades so the
  // sidepanel can render the full lead view in one request batch.
  try {
    const today = new Date().toISOString().split('T')[0];
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86400000).toISOString().split('T')[0];
    const oportunidades = await apiGet('/oportunidades', { Fecha_inicio: twoYearsAgo, Fecha_fin: today });
    const _opps = normalizeList(oportunidades);
    const match = _opps.find(matchFn);
    if (match) {
      results.type = 'oportunidad';
      results.data = match;
      const consec = match.Consecutivo_oportunidad ?? match.Consecutivo;
      if (consec) {
        try {
          const negocios = await apiGet('/negocios', { Consecutivo_oportunidad: consec });
          results.negocios = normalizeList(negocios);
          // Pull recent activities for each negocio (capped to keep the
          // payload small).
          const acts = [];
          for (const n of results.negocios.slice(0, 3)) {
            const cn = n.Consecutivo_negocio ?? n.Consecutivo;
            if (!cn) continue;
            try {
              const list = await apiGet('/actividades', { Consecutivo_negocio: cn });
              acts.push(...normalizeList(list));
            } catch (_) {}
          }
          results.actividades = acts.slice(0, 10);
          // Pipeline states for the visual stepper rendered alongside each
          // negocio. Cached server-side so we don't re-fetch on every render.
          try {
            const flujo = await apiGet('/flujonegocios', { Estado: true });
            results.flujonegocios = normalizeList(flujo);
          } catch (_) {}
        } catch (e) {
          console.warn('[Q10] Error fetching negocios/actividades:', e.message);
        }
      }
      return results;
    }
  } catch (e) {
    console.warn('[Q10] Error searching oportunidades:', e.message);
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
      return handle(searchByPhone(msg.phone, msg.name));

    case 'searchName':
      return handle(searchByName(msg.name));

    case 'fetchCatalogs':
      return handle(fetchCatalogs());

    case 'fetchStudentFinancials':
      return handle(fetchStudentFinancials(msg.codigoEstudiante));

    case 'fetchNegocios':
      // Lista negocios de uma oportunidad. Usado para popular o dropdown
      // do modal de Crear Actividad (em vez de o vendedor digitar ID cru).
      return handle((async () => {
        const consec = msg.consecutivoOportunidad;
        if (!consec) throw new Error('Consecutivo_oportunidad obrigatório');
        return apiGet('/negocios', { Consecutivo_oportunidad: consec });
      })());

    case 'fetchStudentById':
      // Lookup direto via /estudiantes/{Codigo|Numero_identificacion}.
      // Usado pelo card "não encontrado" para o caso da aluna matriculada
      // que não aparece na busca por telefone (não tem login → não está em
      // /usuarios; não foi cadastrada como contacto/lead).
      return handle((async () => {
        const id = (msg.id || '').trim();
        if (!id) throw new Error('ID vazio.');
        const studentRecord = await apiGet(`/estudiantes/${encodeURIComponent(id)}`);
        try {
          const estado = await apiGet('/estadocuentaestudiantes', {}, { shortCache: true });
          const estadoCuenta = Array.isArray(estado)
            ? estado.find(e => e.Codigo_estudiante === studentRecord.Codigo || e.Codigo === studentRecord.Codigo) || null
            : null;
          return { type: 'estudiante', data: studentRecord, estadoCuenta, phone: studentRecord.Celular || studentRecord.Telefono || null, name: null };
        } catch (_) {
          return { type: 'estudiante', data: studentRecord, phone: studentRecord.Celular || studentRecord.Telefono || null, name: null };
        }
      })());

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
        const result = await apiPost('/oportunidades', body);
        // Invalidate the API cache so the next searchByPhone hits a fresh
        // /oportunidades response and surfaces the just-created lead.
        cache.clear();
        return result;
      })());

    case 'fetchMedios':
      return handle(Promise.all([
        apiGet('/mediospublicitarios', { Estado: true }).catch(() => []),
        apiGet('/medioscontacto', { Estado: true }).catch(() => [])
      ]).then(([pub, ctc]) => ({ mediospublicitarios: pub, medioscontacto: ctc })));

    case 'fetchFlujoNegocios':
      // Pipeline states for negocios. Used to populate the initial-state
      // dropdown when creating a negocio (e.g. Presentación, En negociación).
      return handle(apiGet('/flujonegocios', { Estado: true }));

    case 'createNegocio':
      return handle((async () => {
        const body = { ...msg.body };
        if (!body.Numero_identificacion_asesor) {
          const asesorId = await getAsesorId();
          if (asesorId) body.Numero_identificacion_asesor = asesorId;
        }
        const result = await apiPost('/negocios', body);
        cache.clear();
        return result;
      })());

    case 'updateNegocio':
      return handle((async () => {
        const result = await apiPatch('/negocios', msg.body);
        cache.clear();
        return result;
      })());

    case 'changeNegocioEstado':
      // Move a negocio between non-terminal pipeline stages.
      // Q10 endpoint: PATCH /negocios/estado.
      return handle((async () => {
        const result = await apiPatch('/negocios/estado', msg.body);
        cache.clear();
        return result;
      })());

    case 'ganarNegocio':
      // Mark negocio as won. Q10: PUT /negocios/estado/ganar.
      return handle((async () => {
        const result = await apiPut('/negocios/estado/ganar', msg.body);
        cache.clear();
        return result;
      })());

    case 'perderNegocio':
      // Mark negocio as lost. Q10: PUT /negocios/estado/perder.
      // Requires Consecutivo_causa_perdida (from /causas).
      return handle((async () => {
        const result = await apiPut('/negocios/estado/perder', msg.body);
        cache.clear();
        return result;
      })());

    case 'fetchCausas':
      return handle(apiGet('/causas', { Estado: true }));

    case 'updateOportunidad':
      // PATCH /oportunidades — used by "Editar oportunidad" flow.
      return handle((async () => {
        const result = await apiPatch('/oportunidades', msg.body);
        cache.clear();
        return result;
      })());

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
          let tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*', active: true, currentWindow: true });
          if (!tabs.length) tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*', active: true });
          if (!tabs.length) tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
          if (!tabs.length) {
            sendResponse({ ok: false, error: 'WhatsApp Web não encontrado' });
            return;
          }
          chrome.tabs.sendMessage(tabs[0].id, { action: msg.action, cutoffMs: msg.cutoffMs || null }, (resp) => {
            // If the content script isn't listening (page reloading, plugin just installed,
            // etc.) sendMessage delivers no response and sets runtime.lastError. Reading it
            // here both surfaces the failure to the sidepanel and silences Chrome's
            // "Unchecked runtime.lastError" warning.
            const err = chrome.runtime.lastError;
            if (err) {
              sendResponse({ ok: false, error: 'Não foi possível falar com a aba do WhatsApp Web. Recarregue a página e tente novamente.' });
              return;
            }
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
        // Q10 forbids standalone /contactos — POST /oportunidades first, then
        // attach the contacto via the returned Consecutivo_oportunidad. Probe:
        // POST /contactos {Consecutivo_oportunidad:0} → 404 "no se encontró
        // una oportunidad"; omitting the field → 400 "obligatorio".
        const asesorId = await getAsesorId();
        const results = [];
        let abortReason = null;
        for (const c of contacts) {
          if (abortReason) {
            results.push({ phone: c.phone, ok: false, error: abortReason });
            continue;
          }
          const phone = (c.phone || '').replace(/\D/g, '').slice(-12);
          try {
            const nameParts = (c.name || '').trim().split(/\s+/);
            const firstName = nameParts[0] || 'Contato';
            const lastName = nameParts.slice(1).join(' ') || 'WhatsApp';
            const displayName = (c.name || '').trim() || phone || 'Contato WhatsApp';
            const oportunidadBody = {
              Nombre_oportunidad: displayName,
              Numero_identificacion_oportunidad: displayName,
            };
            if (asesorId) oportunidadBody.Numero_identificacion_asesor = asesorId;
            const oportunidad = await apiPost('/oportunidades', oportunidadBody);
            const consecutivo = oportunidad?.Consecutivo_oportunidad ?? oportunidad?.Consecutivo;
            if (!consecutivo) throw new Error('Resposta de /oportunidades sem Consecutivo_oportunidad');
            const contactoBody = {
              Consecutivo_oportunidad: consecutivo,
              Nombres: firstName,
              Apellidos: lastName,
              Detalle: phone ? [{ Tipo_detalle: 'Celular', Descripcion: phone }] : [],
            };
            await apiPost('/contactos', contactoBody);
            results.push({ phone, ok: true });
          } catch (e) {
            const errMsg = e.message || '';
            if (/no se encuentra registrado un asesor/i.test(errMsg)) {
              abortReason = 'O asesor configurado nas Opções não está cadastrado como asesor no Q10. Vá em Q10 → Mercadeo → Asesores. Importação interrompida.';
              results.push({ phone: c.phone, ok: false, error: abortReason });
            } else {
              results.push({ phone: c.phone, ok: false, error: errMsg });
            }
          }
        }
        const ok = results.filter(r => r.ok).length;
        const fail = results.filter(r => !r.ok).length;
        if (ok > 0) cache.clear();
        return { results, summary: { ok, fail }, fatalError: abortReason };
      })());

    default:
      sendResponse({ ok: false, error: `Unknown action: ${msg.action}` });
      return false;
  }
});
