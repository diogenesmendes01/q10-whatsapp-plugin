"use strict";
/* ============================================================
   Q10 CRM — Background Service Worker (TypeScript)
   Handles API calls + Side Panel management + phone relay.
   v2.3 — Real Q10 API (no mocks)
   ============================================================ */
// ---------- Constants ----------
const DEFAULT_API_BASE = 'https://geniusidiomas.com/api/q10';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_SHORT = 60 * 1000; // 1 min for financial data
// In-memory cache
const cache = new Map();
// ---------- Cache helpers ----------
function cacheKey(endpoint, params = {}) {
    return `${endpoint}|${JSON.stringify(params)}`;
}
function getCached(key, ttl) {
    const entry = cache.get(key);
    if (!entry)
        return null;
    if (Date.now() - entry.ts > ttl) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}
function setCache(key, data) {
    cache.set(key, { data, ts: Date.now() });
}
// ---------- Side Panel setup ----------
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });
// ---------- API base URL (tenant-configurable) ----------
let apiBaseUrl = null;
async function getApiBaseUrl() {
    if (apiBaseUrl)
        return apiBaseUrl;
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
    if (!apiKey)
        throw new Error('API key não configurada. Configure a chave Q10 nas opções da extensão.');
    const key = cacheKey(endpoint, params);
    const ttl = opts.shortCache ? CACHE_TTL_SHORT : CACHE_TTL;
    if (!opts.noCache) {
        const cached = getCached(key, ttl);
        if (cached)
            return cached;
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
    if (!apiKey)
        throw new Error('API key não configurada. Configure a chave Q10 nas opções da extensão.');
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
    let digits = (String(raw ?? '') || '').replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length <= 11)
        digits = digits.slice(1);
    return digits;
}
function phoneMatches(contactPhone, searchPhone) {
    const a = normalizePhone(contactPhone);
    const b = normalizePhone(searchPhone);
    if (!a || !b)
        return false;
    if (a === b)
        return true;
    if (a.endsWith(b) || b.endsWith(a))
        return true;
    if (a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8))
        return true;
    return false;
}
// ---------- Name matching ----------
function nameMatches(record, searchName) {
    if (!searchName)
        return false;
    const search = searchName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const parts = [
        record.Nombres, record.Apellidos,
        record.Primer_nombre, record.Segundo_nombre,
        record.Primer_apellido, record.Segundo_apellido,
        record.Nombre, record.nombre,
        record.Nombre_completo
    ].filter((v) => Boolean(v));
    const fullName = parts.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!fullName)
        return false;
    if (fullName === search)
        return true;
    if (fullName.includes(search) || search.includes(fullName))
        return true;
    const searchWords = search.split(/\s+/).filter(w => w.length > 1);
    const nameWords = fullName.split(/\s+/);
    const allMatch = searchWords.every(sw => nameWords.some(nw => nw.includes(sw) || sw.includes(nw)));
    return allMatch && searchWords.length > 0;
}
function makeMatchFn(opts) {
    return (record) => {
        if (opts.phone) {
            return phoneMatches(record.Telefono, opts.phone) || phoneMatches(record.Celular, opts.phone);
        }
        if (opts.name) {
            return nameMatches(record, opts.name);
        }
        return false;
    };
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
async function searchContacts(opts) {
    const results = { type: 'unknown', phone: opts.phone ?? null, name: opts.name ?? null, data: null };
    const matchFn = makeMatchFn(opts);
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
                        results.estadoCuenta = estado.find(e => e.Codigo_estudiante === match.Codigo || e.Codigo === match.Codigo) ?? null;
                    }
                }
                catch (_) { /* ignore */ }
                return results;
            }
        }
    }
    catch (e) {
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
    }
    catch (e) {
        console.warn('[Q10] Error searching contactos:', e.message);
    }
    return results;
}
// ---------- Fetch catalogs ----------
async function fetchCatalogs() {
    function fetchCatalog(p, fallback) {
        return p.then(undefined).catch(() => fallback);
    }
    const [programas, periodos, sedes, jornadas, sedesjornadas, niveles, tiposIdent, sexos, condicionesMat, mediospublicitarios, medioscontacto] = await Promise.all([
        fetchCatalog(apiGet('/programas'), []),
        fetchCatalog(apiGet('/periodos'), []),
        fetchCatalog(apiGet('/sedes'), []),
        fetchCatalog(apiGet('/jornadas'), []),
        fetchCatalog(apiGet('/sedesjornadas'), []),
        fetchCatalog(apiGet('/niveles', { Estado: true }), []),
        fetchCatalog(apiGet('/tiposidentificacion'), []),
        fetchCatalog(apiGet('/sexos'), []),
        fetchCatalog(apiGet('/condicionesMatricula', { Estado: true }), []),
        fetchCatalog(apiGet('/mediospublicitarios', { Estado: true }), []),
        fetchCatalog(apiGet('/medioscontacto', { Estado: true }), [])
    ]);
    return {
        programas,
        periodos,
        sedes,
        jornadas,
        sedesjornadas,
        niveles,
        tiposIdentificacion: tiposIdent,
        sexos,
        condicionesMatricula: condicionesMat,
        mediospublicitarios,
        medioscontacto
    };
}
// ---------- Fetch student financials ----------
async function fetchStudentFinancials(codigoEstudiante) {
    try {
        const estado = await apiGet('/estadocuentaestudiantes', {}, { shortCache: true, noCache: true });
        const estadoCuenta = Array.isArray(estado)
            ? estado.find(e => e.Codigo_estudiante === codigoEstudiante || e.Codigo === codigoEstudiante) ?? null
            : null;
        return { estadoCuenta, pagosPendientes: [], pagosRealizados: [] };
    }
    catch (_) {
        return { estadoCuenta: null, pagosPendientes: [], pagosRealizados: [] };
    }
}
// ---------- Message handler ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handle = (promise) => {
        promise
            .then(data => sendResponse({ ok: true, data }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    };
    switch (msg.action) {
        case 'openSidePanel': {
            (async () => {
                try {
                    const win = await chrome.windows.getCurrent();
                    if (win.id === undefined)
                        throw new Error('No current window ID');
                    await chrome.sidePanel.open({ windowId: win.id });
                    sendResponse({ ok: true });
                }
                catch (err) {
                    sendResponse({ ok: false, error: err.message });
                }
            })();
            return true;
        }
        case 'phoneChanged':
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
            return handle(apiPost('/estudiantes', msg.body));
        case 'createInscripcion':
            return handle(apiPost('/inscripciones', msg.body));
        case 'createMatricula':
            return handle(apiPost('/matriculasProgramas', msg.body));
        case 'createOrdenPago':
            return handle(apiPost('/ordenespago', msg.body));
        case 'createOportunidad':
            return handle((async () => {
                const body = { ...msg.body };
                if (!body.Numero_identificacion_asesor) {
                    const asesorId = await getAsesorId();
                    if (asesorId)
                        body.Numero_identificacion_asesor = asesorId;
                }
                return apiPost('/oportunidades', body);
            })());
        case 'fetchMedios':
            return handle(Promise.all([
                apiGet('/mediospublicitarios', { Estado: true }).catch(() => []),
                apiGet('/medioscontacto', { Estado: true }).catch(() => [])
            ]).then(([pub, ctc]) => ({ mediospublicitarios: pub, medioscontacto: ctc })));
        case 'createActividad':
            return handle((async () => {
                const body = { ...msg.body };
                if (!body.Numero_identificacion_asesor) {
                    const asesorId = await getAsesorId();
                    if (asesorId)
                        body.Numero_identificacion_asesor = asesorId;
                }
                if (!body.Fecha_actividad) {
                    body.Fecha_actividad = new Date().toISOString().split('T')[0];
                }
                return apiPost('/actividades', body);
            })());
        case 'getAsesorId':
            return handle(getAsesorId().then(id => ({ asesorId: id })));
        case 'fetchAdministrativos':
            return handle(apiGet('/administrativos'));
        case 'exportAll':
            return handle((async () => {
                const [contactos, usuarios, oportunidades] = await Promise.all([
                    apiGet('/contactos').catch(() => []),
                    apiGet('/usuarios').catch(() => []),
                    apiGet('/oportunidades').catch(() => [])
                ]);
                return { contactos, estudiantes: usuarios, oportunidades };
            })());
        case 'exportConversation': {
            (async () => {
                try {
                    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*', active: true });
                    if (!tabs.length) {
                        sendResponse({ ok: false, error: 'WhatsApp Web no encontrado' });
                        return;
                    }
                    const tabId = tabs[0].id;
                    if (tabId === undefined) {
                        sendResponse({ ok: false, error: 'No tab ID' });
                        return;
                    }
                    chrome.tabs.sendMessage(tabId, { action: 'exportConversation' }, (resp) => {
                        sendResponse(resp || { ok: false, error: 'Sin respuesta' });
                    });
                }
                catch (e) {
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }
        case 'checkApiKey':
            return handle(getApiKey().then(key => ({ configured: key !== null && key !== '' })));
        case 'clearCache':
            cache.clear();
            sendResponse({ ok: true });
            return false;
        default:
            sendResponse({ ok: false, error: `Unknown action: ${msg.action}` });
            return false;
    }
});
