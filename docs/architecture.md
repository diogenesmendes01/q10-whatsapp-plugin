# Arquitetura

Este doc explica como os **5 contextos de execução** do Chrome MV3 se encaixam neste plugin e como a mensagem sai do DOM do WhatsApp até o Q10.

## Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                        web.whatsapp.com                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PAGE CONTEXT (JS da SPA do WhatsApp)                    │   │
│  │  ┌──────────────────────┐                                │   │
│  │  │ inject/loader.js     │  injetado via <script> tag     │   │
│  │  │  ↓ encontra Store    │                                │   │
│  │  │ inject/inject.js     │  lê Store.Chat / Store.Contact │   │
│  │  └────────┬─────────────┘                                │   │
│  │           │ postMessage({action:'phoneChanged', ...})    │   │
│  │           ↓                                              │   │
│  │  ┌──────────────────────┐                                │   │
│  │  │ ISOLATED CONTEXT     │  ← content script              │   │
│  │  │ content/content.js   │                                │   │
│  │  └────────┬─────────────┘                                │   │
│  └───────────┼──────────────────────────────────────────────┘   │
└──────────────┼──────────────────────────────────────────────────┘
               │ chrome.runtime.sendMessage
               ↓
┌─────────────────────────────────────────────────────────────────┐
│  EXTENSION CONTEXT                                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ background/service-worker.js                              │  │
│  │  - getApiKey() / getAsesorId() from chrome.storage.sync   │  │
│  │  - apiGet / apiPost (com cache de 5min)                   │  │
│  │  - message handlers (searchPhone, createOportunidad, ...) │  │
│  └────┬──────────────────────────────┬───────────────────────┘  │
│       │ fetch()                      │ chrome.runtime.onMessage │
│       ↓                              ↑                          │
│  ┌────────────────┐         ┌────────┴──────────────────────┐   │
│  │ Q10 Jack API   │         │ sidepanel/sidepanel.js        │   │
│  │ (via proxy)    │         │  - render (estudiante/        │   │
│  └────────────────┘         │     contacto/oportunidad)     │   │
│                             │  - wizard 5-step              │   │
│                             │  - modais (oportunidad,       │   │
│                             │     actividad, cobro)         │   │
│                             └───────────────────────────────┘   │
│                             ┌───────────────────────────────┐   │
│                             │ options/options.js            │   │
│                             │  - API key form               │   │
│                             │  - asesor dropdown            │   │
│                             │  - test connection            │   │
│                             └───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Por que tantos contextos?

- **Chrome MV3** isola cada script num mundo próprio. O code da SPA do WhatsApp (page context) não pode falar direto com o service worker da extensão.
- Para ler o `window.Store` interno do WhatsApp (que tem `Chat.Active`, `Contact`, etc.), precisamos estar no **page context** — content script não tem acesso direto.
- Para chamar a API Q10 sem CORS, o service worker faz a requisição de dentro da extensão.

**Caminho de uma mensagem:**
1. WhatsApp SPA troca chat ativo
2. `inject.js` (page ctx) detecta via `Store.Chat` mutation
3. `inject.js` faz `window.postMessage({phone, name})` que só o `content.js` escuta (origem = mesma página)
4. `content.js` faz `chrome.runtime.sendMessage({action:'phoneChanged',...})`
5. Service worker salva em `chrome.storage.session` e o side panel (aberto) faz a busca via nova mensagem

---

## Service worker — API layer

[`background/service-worker.js`](../background/service-worker.js) centraliza tudo que toca rede ou storage persistente. As responsabilidades:

### Caching

```js
const cache = new Map();             // chave: `endpoint|JSON.stringify(params)`
const CACHE_TTL = 5 * 60 * 1000;     // 5 min padrão
const CACHE_TTL_SHORT = 60 * 1000;   // 1 min para dados financeiros
```

Cada `apiGet` serializa endpoint+params como chave, verifica TTL, retorna do cache se fresh. `clearCache` action esvazia tudo (chamada pelo botão "Recarregar" da tela de opções quando troca de API key).

### Handlers suportados (`chrome.runtime.onMessage`)

| Action | Faz |
|---|---|
| `searchPhone` / `searchName` | Busca em `/usuarios` (role=Estudiante), depois `/contactos` |
| `fetchCatalogs` | 11 GETs em paralelo para popular dropdowns do wizard |
| `fetchAdministrativos` | Lista asesores para o dropdown da página de opções |
| `fetchStudentFinancials` | `/estadocuentaestudiantes` com cache curto |
| `fetchMedios` | Atalho para mediospublicitarios + medioscontacto |
| `createContacto` | `POST /contactos` |
| `createEstudiante` | `POST /estudiantes` (⚠ master antigo apontava para `/usuarios` — ver BUG-02) |
| `createInscripcion` | `POST /inscripciones` |
| `createMatricula` | `POST /matriculasProgramas` |
| `createOportunidad` | `POST /oportunidades` (auto-injeta `Numero_identificacion_asesor`) |
| `createActividad` | `POST /actividades` (auto-injeta asesor e `Fecha_actividad` default) |
| `createOrdenPago` | `POST /ordenespago` |
| `exportAll` | Dump de contactos+usuarios para CSV |
| `exportConversation` | Encaminha para content script fazer DOM scrape |

### Normalização

- **Telefone**: `replace(/\D/g, '')` + remove leading zero + mata country code quando > 12 dígitos
- **Nome**: `.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')` (ignora acentos no match)

---

## Side panel — UI principal

[`sidepanel/sidepanel.js`](../sidepanel/sidepanel.js) é quase tudo: ~1.6k linhas com render, wizard e modais. Estrutura interna:

```js
(function () {
  // ---------- HELPERS ----------
  function el(tag, cls, html) { ... }        // createElement + set innerHTML
  function escHtml(s) { ... }                // HTML entities
  function htmlText(value, fallback) { ... } // text content helper
  function htmlAttr(value) { ... }           // attribute helper
  function fullNameHtml(d) { ... }           // escape nome de pessoa

  // ---------- RENDER ----------
  function renderEstudiante(result) { ... }
  function renderOportunidad(result) { ... }
  function renderContacto(data) { ... }
  function renderNoConversation() { ... }
  function renderError(msg) { ... }
  function renderLoading(msg) { ... }

  // ---------- WIZARD 5-step ----------
  function renderWizardStep() { ... }        // switch em wizardState.step
  function submitWizardStep() { ... }

  // ---------- MODALS ----------
  function showCreateOportunidadModal(phone, name) { ... }
  function showCreateContactoModal(phone, name) { ... }
  function showCreateActividadModal(contactData) { ... }
  function showCobroModal(studentData) { ... }

  // ---------- TAGS + NOTES (local, chrome.storage.local) ----------
  function renderTagsSection(contactId, tags) { ... }
  async function renderNotesSection(contactId) { ... }
})();
```

### Estado mantido

- `catalogsCache` — resultado de `fetchCatalogs`, reutilizado entre wizards sem rebuscar
- `wizardState` — `{step, phone, prefill, results: {contacto, estudiante, inscripcion, matricula, cobro}}`
- `currentPhone` / `currentContactName` / `currentResult` — última busca ativa

### XSS hardening

Qualquer dado vindo de `/administrativos`, `/contactos`, `/programas`, etc. que for interpolado em `innerHTML` passa por `escHtml` ou `htmlText`/`htmlAttr`. Toasts usam `textContent`. Ver [PR #4](https://github.com/diogenesmendes01/q10-whatsapp-plugin/pull/4) para o histórico completo.

---

## Options page

[`options/options.js`](../options/options.js) salva 2 chaves em `chrome.storage.sync`:
- `q10ApiKey` — Ocp-Apim-Subscription-Key
- `q10AsesorId` — `Numero_identificacion` do vendedor (selecionado via dropdown)

Lógica especial:
- Dropdown de asesor só habilita após a API key ser salva (fetch `/administrativos` via SW)
- Quando a API key é alterada e o asesor salvo não está na nova lista, **`q10AsesorId` é auto-removido** (protege contra injeção cruzada de tenant)
- Botão 🔄 invalida o cache (clearCache) e re-busca

---

## Popup — desusado

A pasta [`popup/`](../popup/) existe mas não é referenciada no `manifest.json` (não tem `default_popup` na action). Clicar no ícone da extensão abre o **side panel** graças a `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` em `service-worker.js:34`.

O código de popup pode ser removido em cleanup futuro.
