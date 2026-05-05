# Q10 CRM para WhatsApp Web

Extensão Chrome (Manifest V3) que integra o **Q10 Académico** dentro do **WhatsApp Web**. Detecta automaticamente o contato da conversa ativa, cruza com o CRM do Q10 e expõe ações de atendimento (criar lead, registrar atividade, matricular estudante, gerar cobro) num painel lateral — sem o vendedor precisar alternar entre abas.

- **Versão:** 3.4.0
- **Plataforma:** Chrome / Edge / Brave (MV3, side panel API)
- **Alvo:** `https://web.whatsapp.com/*`
- **Backend:** Q10 Jack API oficial — `https://api.q10.com/v1` (header `Api-Key`). Suporta também proxies tipo `geniusidiomas.com/api/q10` com header `X-Q10-Key`. Ver [docs/q10-api-notes.md](docs/q10-api-notes.md).

---

## Para quem é

**Vendedores de escola** que atendem leads pelo WhatsApp e precisam atualizar o CRM a cada interação. O plugin elimina o custo de alternar entre abas e evita perda de histórico.

Hoje o plugin cobre 4 fluxos principais:

| Fluxo | O que faz |
|---|---|
| **Consultar** | Detecta o telefone/nome da conversa ativa, busca em estudiantes/contactos/oportunidades do Q10 e mostra dados no painel lateral |
| **Criar lead** | Modal de criação rápida de contacto + oportunidade (com medio de contacto/publicitario) |
| **Matricular** | Wizard de 5 passos: contacto → estudiante → inscripción → matrícula → cobro |
| **Registrar atividade** | Modal para logar cada interação (Llamada/WhatsApp/Correo/Nota/Reunión) vinculada ao negocio da oportunidade |

---

## Instalação

### Pré-requisitos

- Google Chrome, Edge ou Brave (última versão)
- Conta ativa no Q10 Académico (`app.q10.com`)
- API key do Q10 (`Ocp-Apim-Subscription-Key`) — gere em **Configuración → Integraciones → API**
- Seu `Numero_identificación` de administrativo no Q10 (visível em **Administrativos → seu perfil**)

### Passos

1. Clone o repositório ou baixe o ZIP:
   ```bash
   git clone https://github.com/diogenesmendes01/q10-whatsapp-plugin.git
   ```
2. No Chrome, abra `chrome://extensions` e ative **Modo desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `q10-whatsapp-plugin`.
4. O ícone do Q10 deve aparecer na barra de extensões.

### Configuração

1. Clique direito no ícone da extensão → **Opções** (ou `chrome://extensions` → **Detalhes** → **Opções da extensão**).
2. Cole sua **API Key** (Ocp-Apim-Subscription-Key) e clique em **Salvar**.
3. (Após PR #2 ser merged) Selecione seu nome no dropdown **Asesor** e salve.
4. Clique em **Testar Conexão** para confirmar.

---

## Como usar

1. Abra `https://web.whatsapp.com` e aguarde o login.
2. Clique no ícone da extensão → abre o **painel lateral** do Chrome.
3. Entre em qualquer conversa — o plugin detecta nome/telefone e busca no Q10.
4. Se for **estudiante**: dados acadêmicos + financeiros (quando disponível).
5. Se for **contacto/oportunidad**: pipeline + atividades recentes.
6. Se **não encontrado**: botões para criar contacto ou oportunidade rapidamente.

### Botões de ação disponíveis no painel

- **Matricular Alumno** — abre wizard de 5 passos
- **Crear Oportunidad** — cria lead rápido
- **Registrar Actividad** — loga interação no CRM (precisa ter oportunidade já criada)
- **Generar Cobro** — cria orden de pago (requer modelo financeiro ativo no tenant)
- **Exportar Datos** — CSV de contactos/estudiantes/oportunidades
- **Exportar Chat** — TXT com o histórico da conversa ativa

---

## Estrutura do projeto

```
q10-whatsapp-plugin/
├── manifest.json              # MV3 manifest
├── background/
│   └── service-worker.js      # API proxy, caching, orquestração
├── content/
│   └── content.js             # Bridge page ↔ extensão
├── inject/
│   ├── loader.js              # Extrai Store interno do WhatsApp
│   └── inject.js              # Lê chat ativo (nome+telefone)
├── sidepanel/
│   ├── sidepanel.html         # UI container
│   └── sidepanel.js           # Render + wizard + modais (~1.6k linhas)
├── options/
│   ├── options.html           # Página de configurações
│   └── options.js             # API key + asesor picker
├── popup/                     # [DESUSADO] extension clique abre side panel em vez de popup
├── styles/                    # CSS (sidepanel, content)
└── icons/                     # Extension icons
```

Veja [docs/architecture.md](docs/architecture.md) para o data flow detalhado entre os 5 contextos (page, content script, service worker, side panel, options).

---

## Desenvolvimento

**Regra de ouro:** seguir a [documentação oficial do Q10 Jack API](https://developer.q10.com/api-details#api=jack-api) e **testar contra a API real** — nunca criar mocks. Ver [CONTRIBUTING.md](CONTRIBUTING.md).

### Recarregar após mudar código

1. `chrome://extensions` → clique no ícone de recarregar na extensão
2. Recarregue `web.whatsapp.com` também (F5)

### Validar sintaxe

```bash
node --check background/service-worker.js
node --check sidepanel/sidepanel.js
node --check options/options.js
```

### Convenções da Q10 API

- Base URL oficial (default): `https://api.q10.com/v1` — header `Api-Key`
- Base URL de proxy alternativo: `https://geniusidiomas.com/api/q10` — header `X-Q10-Key`
- O código escolhe o header automaticamente pelo host configurado em **Opções → API Base URL**
- Payloads aceitam `Estado` como **boolean** (`true`/`false`), **não** string (`'Activo'`)
- Endpoints com nomes surpreendentes: `/condicionesMatricula` (camelCase), `/sedesjornadas` (sem hífen)

Detalhes completos em [docs/q10-api-notes.md](docs/q10-api-notes.md).

---

## Limitações conhecidas

- **Tenants sem modelo financeiro Q10** → `/facturas`, `/ordenespago`, `/estadocuentaestudiantes` retornam HTTP 400. O plugin degrada graciosamente e mostra aviso no wizard de cobro.
- **Valores de enum configuráveis por tenant** (`Tipo_actividad`, `Estado_actividad`, `Condicion_matricula`) — hoje usam os valores padrão Q10; para tenants que customizaram, podem precisar ajuste.
- **Busca de "estudiantes" via `/usuarios`** — a doc oficial tem `/estudiantes`, mas essa rota retorna 404 no proxy atual. Acesso a detalhes completos usa `/estudiantes/{id}` que funciona individualmente.
- **Apenas web.whatsapp.com** — não funciona em WhatsApp Business Desktop nem no app mobile.

---

## Segurança

- A API key é armazenada em `chrome.storage.sync` (sincronizada entre dispositivos do mesmo user Chrome, criptografada pela plataforma).
- Dados dinâmicos (nomes, emails, telefones do Q10) passam por escape HTML antes de renderizar no side panel.
- Ao limpar a API key nas opções, o `q10AsesorId` também é removido para evitar injeção cruzada de tenant.

---

## Licença

Uso interno. Entre em contato com o mantenedor antes de redistribuir.
