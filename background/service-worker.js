/* ============================================================
   Q10 CRM — Background Service Worker
   Handles API calls + Side Panel management + phone relay.
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

// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ---------- API helpers ----------

async function getApiKey() {
  const result = await chrome.storage.sync.get(['q10ApiKey']);
  return result.q10ApiKey || null;
}

async function apiGet(endpoint, params = {}, opts = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API key não configurada. Acesse as configurações da extensão.');

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
  if (!apiKey) throw new Error('API key não configurada.');

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
  if (digits.length >= 12 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

function phoneMatches(contactPhone, searchPhone) {
  const a = normalizePhone(contactPhone);
  const b = normalizePhone(searchPhone);
  if (!a || !b) return false;
  return a.endsWith(b) || b.endsWith(a) || a === b;
}

// ---------- Search logic ----------

async function searchByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 8) {
    throw new Error('Número de telefone inválido.');
  }

  const results = { type: 'unknown', phone: normalized, data: null };

  // 1. Search estudiantes
  try {
    const estudiantes = await apiGet('/estudiantes');
    if (Array.isArray(estudiantes)) {
      const match = estudiantes.find(e =>
        phoneMatches(e.Telefono, normalized) || phoneMatches(e.Celular, normalized)
      );
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

        try {
          const pendientes = await apiGet('/pagosPendientes', {}, { shortCache: true });
          if (Array.isArray(pendientes)) {
            results.pagosPendientes = pendientes.filter(p =>
              p.Codigo_estudiante === match.Codigo || p.Codigo === match.Codigo
            );
          }
        } catch (_) {}

        return results;
      }
    }
  } catch (e) {
    console.warn('[Q10] Error searching estudiantes:', e.message);
  }

  // 2. Search contactos
  try {
    const contactos = await apiGet('/contactos');
    if (Array.isArray(contactos)) {
      const match = contactos.find(c =>
        phoneMatches(c.Telefono, normalized) || phoneMatches(c.Celular, normalized)
      );
      if (match) {
        results.type = 'contacto';
        results.data = match;
        return results;
      }
    }
  } catch (e) {
    console.warn('[Q10] Error searching contactos:', e.message);
  }

  // 3. Search oportunidades
  try {
    const oportunidades = await apiGet('/oportunidades');
    if (Array.isArray(oportunidades)) {
      const match = oportunidades.find(o =>
        phoneMatches(o.Telefono, normalized) || phoneMatches(o.Celular, normalized)
      );
      if (match) {
        results.type = 'oportunidad';
        results.data = match;

        try {
          const negocios = await apiGet('/negocios');
          if (Array.isArray(negocios)) {
            results.negocios = negocios.filter(n => n.Codigo_oportunidad === match.Codigo);
          }
        } catch (_) {}

        try {
          const actividades = await apiGet('/actividades');
          if (Array.isArray(actividades)) {
            results.actividades = actividades
              .filter(a => a.Codigo_oportunidad === match.Codigo)
              .slice(0, 5);
          }
        } catch (_) {}

        return results;
      }
    }
  } catch (e) {
    console.warn('[Q10] Error searching oportunidades:', e.message);
  }

  return results;
}

// ---------- Fetch catalogs ----------

async function fetchCatalogs() {
  const [programas, periodos] = await Promise.all([
    apiGet('/programas').catch(() => []),
    apiGet('/periodos').catch(() => [])
  ]);
  return { programas: Array.isArray(programas) ? programas : [], periodos: Array.isArray(periodos) ? periodos : [] };
}

// ---------- Fetch student financials ----------

async function fetchStudentFinancials(codigoEstudiante) {
  const [estado, pendientes, pagos] = await Promise.all([
    apiGet('/estadocuentaestudiantes', {}, { shortCache: true, noCache: true }).catch(() => []),
    apiGet('/pagosPendientes', {}, { shortCache: true, noCache: true }).catch(() => []),
    apiGet('/pagos', {}, { shortCache: true }).catch(() => [])
  ]);

  const filterByStudent = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(item =>
      item.Codigo_estudiante === codigoEstudiante ||
      item.Codigo === codigoEstudiante
    );
  };

  return {
    estadoCuenta: Array.isArray(estado)
      ? estado.find(e => e.Codigo_estudiante === codigoEstudiante || e.Codigo === codigoEstudiante) || null
      : null,
    pagosPendientes: filterByStudent(pendientes),
    pagosRealizados: filterByStudent(pagos).slice(0, 10)
  };
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
    // --- Side Panel ---
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
      // Store phone in session storage so side panel can read it
      chrome.storage.session.set({ currentPhone: msg.phone || null });
      sendResponse({ ok: true });
      return false;

    // --- API calls ---
    case 'searchPhone':
      return handle(searchByPhone(msg.phone));

    case 'fetchCatalogs':
      return handle(fetchCatalogs());

    case 'fetchStudentFinancials':
      return handle(fetchStudentFinancials(msg.codigoEstudiante));

    // --- POST actions ---
    case 'createContacto':
      return handle(apiPost('/contactos', msg.body));

    case 'createEstudiante':
      return handle(apiPost('/estudiantes', msg.body));

    case 'createInscripcion':
      return handle(apiPost('/inscripciones', msg.body));

    case 'createMatricula':
      return handle(apiPost('/matriculasProgramas', msg.body));

    case 'createOrdenPago':
      return handle(apiPost('/ordenespago', msg.body));

    case 'createOportunidad':
      return handle(apiPost('/oportunidades', msg.body));

    case 'createActividad':
      return handle(apiPost('/actividades', msg.body));

    // --- Utility ---
    case 'checkApiKey':
      return handle(
        getApiKey().then(key => ({ configured: !!key }))
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
