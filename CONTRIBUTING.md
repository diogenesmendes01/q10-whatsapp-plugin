# Como contribuir

Obrigado pelo interesse. Regras para manter a qualidade e evitar repetir dores passadas.

## Regra de ouro: sem mocks, sempre API real

**Nunca crie mocks do Q10 para testar.** A primeira iteração do plugin fez isso e o resultado foram campos com nomes errados, enums fora do padrão e bugs que só apareciam em produção. Toda mudança que toca integração com Q10 deve ser validada contra a API real usando `curl` ou o próprio plugin.

Se você não tem API key de um tenant de teste, peça uma ao mantenedor. Não invente stubs "só pra rodar o código".

Ver [docs/q10-api-notes.md](docs/q10-api-notes.md) para o método de descoberta de schema e os invariantes já validados.

## Antes de abrir PR

1. **Rode `node --check`** nos arquivos alterados:
   ```bash
   node --check background/service-worker.js
   node --check sidepanel/sidepanel.js
   node --check options/options.js
   ```
2. **Recarregue a extensão no Chrome** (`chrome://extensions` → botão reload) e teste o fluxo afetado em `web.whatsapp.com`.
3. **Rode `git diff --check`** para pegar whitespace suspeito.
4. **Se tocar payload de API**, valide com `curl` contra tenant de desenvolvimento. Exemplo:
   ```bash
   KEY='...'
   curl -H "X-Q10-Key: $KEY" -H "Content-Type: application/json" \
     -X POST -d '{}' https://geniusidiomas.com/api/q10/actividades
   # espere receber 400 listando os campos obrigatórios
   ```

## Convenções de código

### Escape de HTML

Qualquer valor dinâmico (API do Q10, input de usuário, dados do WhatsApp) que entra em `innerHTML` **deve** passar por escape:

```js
// Texto entre tags:
`<div>${htmlText(d.Email)}</div>`

// Atributo HTML:
`<input value="${htmlAttr(pf.Nombre)}">`

// Opção de dropdown:
`<option value="${escHtml(p.Codigo)}">${escHtml(p.Nombre)}</option>`
```

- `htmlText(valor, fallback)` — para conteúdo de texto; fallback default é `—`
- `htmlAttr(valor)` — para valor de atributo
- `escHtml(valor)` — escape cru (usado por dropdowns com formatação custom)

Para conteúdo que não vem de `innerHTML`, prefira **`textContent`** direto:
```js
el.textContent = msg; // seguro por definição
```

### Payloads para Q10

- `Estado` em query params e bodies é **sempre boolean** (`true`/`false`), nunca string.
- Nomes de campos da Q10 API são **exatamente** como na doc oficial (ex.: `Codigo_tipo_identificacion`, não `Tipo_identificacion`).
- Celular no `Detalle[]` limitado a 12 dígitos — use `phone.replace(/\D/g, '').slice(-12)`.
- `Numero_identificacion_asesor` vem de `chrome.storage.sync['q10AsesorId']` — não hardcode.

### Error handling

- **Não silencie erros** com `.catch(() => [])`. Use pelo menos `console.warn('[Q10]', e.message)`.
- Erros de API com mensagens específicas (ex.: "modelo financiero") devem virar mensagens amigáveis no toast ao invés de quebrar o fluxo.

### Estilo

- JavaScript vanilla. Sem frameworks, sem transpile, sem bundler.
- Indentação: 2 espaços.
- Aspas simples em strings JS. Template literals para interpolação.
- Comentários em português ou inglês — escolha e seja consistente no arquivo.

## Fluxo de PR

1. Crie branch a partir de `master` (ou da PR pai se for stack): `fix/descricao-curta` ou `feat/descricao-curta`
2. Commit com mensagens que expliquem o **porquê** (não só o que):
   ```
   fix: medios dropdowns use Estado=true boolean (BUG-01)

   The Q10 API rejects Estado='Activo' (string) with HTTP 400
   "The value 'Activo' is not valid for Nullable`1". Changed to
   Estado=true (boolean) per live API validation.
   ```
3. Abra PR com:
   - **Summary** (1-3 bullets)
   - **Evidence** quando possível — output de curl, screenshot, linha do código
   - **Test plan** (checklist do que verificar no browser)
   - **Follow-ups** se deixar algo explicitamente fora de escopo
4. Responda aos comments do review no mesmo commit quando possível (não abra PR nova para cada ciclo).

## Para mudanças grandes

Abra **issue** primeiro descrevendo o problema e a abordagem proposta. Especialmente para:
- Migração de proxy → API oficial
- Refatoração de `sidepanel.js` (o arquivo tem ~1.6k linhas e é conhecido como precisando quebrar)
- Novos fluxos do CRM (por exemplo, suporte a renovação de matrícula)

## Segredos

- **Nunca** commite API keys, dumps de dados reais de Q10 (com nomes/emails), ou arquivos `.env`.
- Use `curl` inline com variável de ambiente: `KEY='...' curl -H "X-Q10-Key: $KEY" ...`.
