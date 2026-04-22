/* ============================================================
   Q10 CRM — Background Service Worker (TypeScript)
   Handles API calls + Side Panel management + phone relay.
   v2.3 — Real Q10 API (no mocks)
   ============================================================ */

interface CacheEntry<T = unknown> {
  data: T;
  ts: number;
}

interface ApiGetOptions {
  shortCache?: boolean;
  noCache?: boolean;
}

interface SearchResult {
  type: 'estudiante' | 'contacto' | 'unknown';
  phone: string | null;
  name: string | null;
  data: EstudianteRecord | ContactoRecord | null;
  estadoCuenta?: EstadoCuentaRecord | null;
}

interface Catalogs {
  programas: ProgramaRecord[];
  periodos: PeriodoRecord[];
  sedes: SedeRecord[];
  jornadas: JornadaRecord[];
  sedesjornadas: SedeJornadaRecord[];
  niveles: NivelRecord[];
  tiposIdentificacion: TipoIdentRecord[];
  sexos: SexoRecord[];
  condicionesMatricula: CondicionMatriculaRecord[];
  mediospublicitarios: MedioPublicitarioRecord[];
  medioscontacto: MedioContactoRecord[];
}

interface FinancialResult {
  estadoCuenta: EstadoCuentaRecord | null;
  pagosPendientes: unknown[];
  pagosRealizados: unknown[];
}

interface ChromeMessageResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

// Q10 API record types
interface EstudianteRecord {
  Codigo?: string | number;
  Nombres?: string;
  Segundo_nombre?: string;
  Primer_apellido?: string;
  Segundo_apellido?: string;
  Nombres_persona?: string;
  Apellidos_persona?: string;
  Telefono?: string;
  Celular?: string;
  [key: string]: unknown;
}

interface ContactoRecord {
  Codigo?: string | number;
  Nombre?: string;
  Nombre_completo?: string;
  Telefono?: string;
  Celular?: string;
  [key: string]: unknown;
}

interface EstadoCuentaRecord {
  Codigo_estudiante?: string | number;
  Codigo?: string | number;
  [key: string]: unknown;
}

interface ProgramaRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }
interface PeriodoRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }
interface SedeRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }
interface JornadaRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }
interface SedeJornadaRecord { Consecutivo: string | number; Nombre?: string; [key: string]: unknown; }
interface NivelRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }
interface TipoIdentRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }
interface SexoRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }
interface CondicionMatriculaRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }
interface MedioPublicitarioRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }
interface MedioContactoRecord { Codigo: string | number; Nombre?: string; [key: string]: unknown; }

// ---------- Constants ----------

const DEFAULT_API_BASE = 'https://geniusidiomas.com/api/q10';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_SHORT = 60 * 1000; // 1 min for financial data

// In-memory cache
const cache = new Map<string, CacheEntry>();

// ---------- Cache helpers ----------

function cacheKey(endpoint: string, params: Record<string, unknown> = {}): string {
  return `${endpoint}|${JSON.stringify(params)}`;
}

function getCached<T>(key: string, ttl: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

// ---------- Side Panel setup ----------

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ---------- API base URL (tenant-configurable) ----------

let apiBaseUrl: string | null = null;

async function getApiBaseUrl(): Promise<string> {
  if (apiBaseUrl) return apiBaseUrl;
  const result = await chrome.storage.local.get(['apiBaseUrl']);
  apiBaseUrl = (result.apiBaseUrl as string || '').trim() || DEFAULT_API_BASE;
  return apiBaseUrl;
}

// ---------- API helpers ----------

async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.sync.get(['q10ApiKey']);
  return (result.q10ApiKey as string) || null;
}

async function getAsesorId(): Promise<string | null> {
  const result = await chrome.storage.sync.get(['q10AsesorId']);
  return (result.q10AsesorId as string) || null;
}

async function apiGet<T = unknown>(endpoint: string, params: Record<string, unknown> = {}, opts: ApiGetOptions = {}): Promise<T> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API key não configurada. Configure a chave Q10 nas opções da extensão.');

  const key = cacheKey(endpoint, params);
  const ttl = opts.shortCache ? CACHE_TTL_SHORT : CACHE_TTL;
  if (!opts.noCache) {
    const cached = getCached<T>(key, ttl);
    if (cached) return cached;
  }

  const base = await getApiBaseUrl();
  const query = new URLSearchParams({ Limit: '1000', Offset: '1', ...params } as Record<string, string>).toString();
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

  const data = await resp.json() as T;
  setCache(key, data);
  return data;
}

async function apiPost<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<T> {
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

  return resp.json() as T;
}

// ---------- Phone normalization ----------

function normalizePhone(raw: unknown): string {
  let digits = (String(raw ?? '') || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length <= 11) digits = digits.slice(1);
  return digits;
}

function phoneMatches(contactPhone: unknown, searchPhone: string): boolean {
  const a = normalizePhone(contactPhone);
  const b = normalizePhone(searchPhone);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(b) || b.endsWith(a)) return true;
  if (a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8)) return true;
  return false;
}

// ---------- Name matching ----------

function nameMatches(record: Record<string, unknown>, searchName: string): boolean {
  if (!searchName) return false;
  const search = searchName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const parts = [
    record.Nombres, record.Apellidos,
    record.Primer_nombre, record.Segundo_nombre,
    record.Primer_apellido, record.Segundo_apellido,
    record.Nombre, record.nombre,
    record.Nombre_completo
  ].filter((v): v is string => Boolean(v));

  const fullName = parts.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (!fullName) return false;
  if (fullName === search) return true;
  if (fullName.includes(search) || search.includes(fullName)) return true;

  const searchWords = search.split(/\s+/).filter(w => w.length > 1);
  const nameWords = fullName.split(/\s+/);
  const allMatch = searchWords.every(sw =>
    nameWords.some(nw => nw.includes(sw) || sw.includes(nw))
  );

  return allMatch && searchWords.length > 0;
}

// ---------- Match function factory ----------

type MatchFn = (record: Record<string, unknown>) => boolean;

function makeMatchFn(opts: { phone?: string; name?: string }): MatchFn {
  return (record: Record<string, unknown>): boolean => {
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

async function searchByPhone(phone: string): Promise<SearchResult> {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 8) {
    throw new Error('Número de telefone inválido.');
  }
  return searchContacts({ phone: normalized });
}

async function searchByName(name: string): Promise<SearchResult> {
  if (!name || name.length < 2) {
    throw new Error('Nombre demasiado corto.');
  }
  return searchContacts({ name });
}

async function searchContacts(opts: { phone?: string; name?: string }): Promise<SearchResult> {
  const results: SearchResult = { type: 'unknown', phone: opts.phone ?? null, name: opts.name ?? null, data: null };
  const matchFn = makeMatchFn(opts);

  // 1. Search usuarios (alunos/estudantes)
  try {
    const usuarios = await apiGet<EstudianteRecord[]>('/usuarios');
    if (Array.isArray(usuarios)) {
      const match = usuarios.find(matchFn);
      if (match) {
        results.type = 'estudiante';
        results.data = match;

        try {
          const estado = await apiGet<EstadoCuentaRecord[]>('/estadocuentaestudiantes', {}, { shortCache: true });
          if (Array.isArray(estado)) {
            results.estadoCuenta = estado.find(e =>
              e.Codigo_estudiante === match.Codigo || e.Codigo === match.Codigo
            ) ?? null;
          }
        } catch (_) { /* ignore */ }

        return results;
      }
    }
  } catch (e) {
    console.warn('[Q10] Error searching usuarios:', (e as Error).message);
  }

  // 2. Search contactos
  try {
    const contactos = await apiGet<ContactoRecord[]>('/contactos');
    if (Array.isArray(contactos)) {
      const match = contactos.find(matchFn);
      if (match) {
        results.type = 'contacto';
        results.data = match;
        return results;
      }
    }
  } catch (e) {
    console.warn('[Q10] Error searching contactos:', (e as Error).message);
  }

  return results;
}

// ---------- Fetch catalogs ----------

async function fetchCatalogs(): Promise<Catalogs> {
  function fetchCatalog<T>(p: Promise<T>, fallback: T): Promise<T> {
    return p.then(undefined).catch(() => fallback) as Promise<T>;
  }

  const [programas, periodos, sedes, jornadas, sedesjornadas, niveles, tiposIdent, sexos, condicionesMat, mediospublicitarios, medioscontacto] = await Promise.all([
    fetchCatalog(apiGet<ProgramaRecord[]>('/programas'), []),
    fetchCatalog(apiGet<PeriodoRecord[]>('/periodos'), []),
    fetchCatalog(apiGet<SedeRecord[]>('/sedes'), []),
    fetchCatalog(apiGet<JornadaRecord[]>('/jornadas'), []),
    fetchCatalog(apiGet<SedeJornadaRecord[]>('/sedesjornadas'), []),
    fetchCatalog(apiGet<NivelRecord[]>('/niveles', { Estado: true }), []),
    fetchCatalog(apiGet<TipoIdentRecord[]>('/tiposidentificacion'), []),
    fetchCatalog(apiGet<SexoRecord[]>('/sexos'), []),
    fetchCatalog(apiGet<CondicionMatriculaRecord[]>('/condicionesMatricula', { Estado: true }), []),
    fetchCatalog(apiGet<MedioPublicitarioRecord[]>('/mediospublicitarios', { Estado: true }), []),
    fetchCatalog(apiGet<MedioContactoRecord[]>('/medioscontacto', { Estado: true }), [])
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

async function fetchStudentFinancials(codigoEstudiante: string | number): Promise<FinancialResult> {
  try {
    const estado = await apiGet<EstadoCuentaRecord[]>('/estadocuentaestudiantes', {}, { shortCache: true, noCache: true });
    const estadoCuenta = Array.isArray(estado)
      ? estado.find(e => e.Codigo_estudiante === codigoEstudiante || e.Codigo === codigoEstudiante) ?? null
      : null;
    return { estadoCuenta, pagosPendientes: [], pagosRealizados: [] };
  } catch (_) {
    return { estadoCuenta: null, pagosPendientes: [], pagosRealizados: [] };
  }
}

// ---------- Message handler ----------

chrome.runtime.onMessage.addListener((msg: Record<string, unknown>, _sender: chrome.runtime.MessageSender, sendResponse: (response: ChromeMessageResponse) => void): boolean => {
  const handle = (promise: Promise<unknown>): boolean => {
    promise
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: (err as Error).message }));
    return true;
  };

  switch (msg.action) {
    case 'openSidePanel': {
      (async () => {
        try {
          const win = await chrome.windows.getCurrent();
          if (win.id === undefined) throw new Error('No current window ID');
          await chrome.sidePanel.open({ windowId: win.id });
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: (err as Error).message });
        }
      })();
      return true;
    }

    case 'phoneChanged':
      chrome.storage.session.set({
        currentPhone: (msg.phone as string) || null,
        currentContactName: (msg.contactName as string) || null
      });
      sendResponse({ ok: true });
      return false;

    case 'searchPhone':
      return handle(searchByPhone(msg.phone as string));

    case 'searchName':
      return handle(searchByName(msg.name as string));

    case 'fetchCatalogs':
      return handle(fetchCatalogs());

    case 'fetchStudentFinancials':
      return handle(fetchStudentFinancials(msg.codigoEstudiante as string | number));

    case 'createContacto':
      return handle(apiPost('/contactos', msg.body as Record<string, unknown>));

    case 'createEstudiante':
      return handle(apiPost('/estudiantes', msg.body as Record<string, unknown>));

    case 'createInscripcion':
      return handle(apiPost('/inscripciones', msg.body as Record<string, unknown>));

    case 'createMatricula':
      return handle(apiPost('/matriculasProgramas', msg.body as Record<string, unknown>));

    case 'createOrdenPago':
      return handle(apiPost('/ordenespago', msg.body as Record<string, unknown>));

    case 'createOportunidad':
      return handle((async () => {
        const body = { ...msg.body as Record<string, unknown> } as Record<string, unknown>;
        if (!body.Numero_identificacion_asesor) {
          const asesorId = await getAsesorId();
          if (asesorId) body.Numero_identificacion_asesor = asesorId;
        }
        return apiPost('/oportunidades', body);
      })());

    case 'fetchMedios':
      return handle(Promise.all([
        apiGet<MedioPublicitarioRecord[]>('/mediospublicitarios', { Estado: true }).catch(() => []),
        apiGet<MedioContactoRecord[]>('/medioscontacto', { Estado: true }).catch(() => [])
      ]).then(([pub, ctc]) => ({ mediospublicitarios: pub, medioscontacto: ctc })));

    case 'createActividad':
      return handle((async () => {
        const body = { ...msg.body as Record<string, unknown> } as Record<string, unknown>;
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
          if (tabId === undefined) { sendResponse({ ok: false, error: 'No tab ID' }); return; }
          chrome.tabs.sendMessage(tabId, { action: 'exportConversation' }, (resp: unknown) => {
            sendResponse((resp as ChromeMessageResponse) || { ok: false, error: 'Sin respuesta' });
          });
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error).message });
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