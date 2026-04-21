# Q10 Jack API — notas práticas

Este arquivo captura **invariantes validados ao vivo** contra a API real do Q10. É complemento à doc oficial (`https://developer.q10.com/api-details#api=jack-api`), que lista os 179 endpoints mas **não expõe schemas nem valores de enum**.

Última validação: 2026-04-21 (tenant `geniusidiomas`).

---

## Conventions

### Hosts e autenticação

| Host | Header de auth | Observação |
|---|---|---|
| `https://geniusidiomas.com/api/q10` | `X-Q10-Key` | Proxy do cliente — usado pelo plugin atualmente |
| `https://api.q10.com/v1` | `Api-Key` | API oficial Azure APIM — **rejeita** `X-Q10-Key` com 401 |

A mesma key funciona nos dois hosts e retorna os mesmos dados. Migração proxy → oficial é viável, só precisa trocar base URL + header.

### Tipos de valor

- **`Estado`** em query params e bodies é **boolean** (`true`/`false`). Enviar string `"Activo"` retorna:
  ```json
  {"code":"4001","message":"...","validationErrors":{"Estado":["The value 'Activo' is not valid for Nullable`1."]}}
  ```
- **`Consecutivo_*`** são **inteiros** na query mas a API aceita string (ex.: `?Consecutivo_periodo=2`).
- Datas são ISO 8601 curto: `"2026-04-20"` (sem horário) ou `"2026-04-20T09:27:30.93"` (retorno).

### HTTP status

- `401` — "invalid subscription key" (auth real, não fallback silencioso)
- `400` + `code: "4001"` — erro de validação de schema (inclui lista `validationErrors` por campo)
- `400` + `code: "400"` — outras validações (params obrigatórios, modelo financeiro, etc.)
- `404` — endpoint não existe ou modelo não se aplica ao tipo de instituição (ex.: `/annoslectivos` em ETDH)

---

## Endpoints que o plugin usa

### Catálogos (GET, read-only)

| Endpoint | Query obrigatória | Retorna |
|---|---|---|
| `/administrativos` | — | Lista de pessoas administrativas (asesores) |
| `/programas` | — | Programas acadêmicos |
| `/periodos` | — | Períodos letivos (com `Consecutivo` int) |
| `/sedes` | — | Filiais |
| `/jornadas` | — | Turnos (Mañana/Tarde/Noche/Sábado) |
| `/sedesjornadas` | — | Combos sede×jornada (com `Consecutivo` único) |
| `/niveles` | `?Estado=true` | Níveis acadêmicos (A1-C2 em escolas de idiomas) |
| `/tiposidentificacion` | — | Tipos de documento (CR01, CR02, etc.) |
| `/sexos` | — | `F`/`M` |
| `/mediospublicitarios` | `?Estado=true` | Origens de lead (Facebook, Instagram, etc.) |
| `/medioscontacto` | `?Estado=true` | Canais de contato (WhatsApp, etc.) |
| `/condicionesMatricula` | `?Estado=true` | Condições de matrícula (ver enum abaixo) |
| `/flujonegocios` | `?Estado=true` | Estados do pipeline CRM |
| `/causas` | `?Estado=true` | Causas de perda de oportunidade |
| `/oportunidad/campospersonalizados` | `?Estado=true` | Campos customizados do CRM |

### Entidades (GET individual)

- `GET /estudiantes/{id}` — detalhe de aluno (`id` = Codigo_persona). **`/estudiantes` (lista) retorna 404**, mas o detalhe funciona.
- `GET /usuarios/{id}` — detalhe de usuário-login (diferente de estudante).
- `GET /oportunidades/{Consecutivo_oportunidad}` — inclui `Negocio_favorito.Consecutivo_negocio` embutido.
- `GET /negocios/{Consecutivo_negocio}` — detalhe do negocio.
- `GET /actividades?Consecutivo_negocio={id}` — histórico de interações de um negocio.

### Listas com filtro obrigatório

| Endpoint | Param obrigatório | Nota |
|---|---|---|
| `GET /oportunidades` | `Fecha_inicio` + `Fecha_fin` | Sem as duas datas → 404 |
| `GET /negocios` | Pelo menos 1 param de filtro | Sem nenhum → 400 "ingresar al menos un parámetro" |
| `GET /inscripciones` | Pelo menos 1 filtro | 400 "No se ha ingresado ningún filtro" |

### Criação (POST)

#### POST /contactos

Cria um lead. Schema mínimo:

```json
{
  "Consecutivo_oportunidad": 0,
  "Nombres": "Maria Silva",
  "Apellidos": "Oliveira",
  "Detalle": [
    { "Tipo_detalle": "Email", "Descripcion": "maria@ex.com" },
    { "Tipo_detalle": "Celular", "Descripcion": "5519988145438" }
  ]
}
```

- `Detalle` aceita apenas `Tipo_detalle: "Celular"` ou `"Email"` (tentar `"Telefono"` não funciona)
- Campo `Descripcion` do Celular é limitado a **12 dígitos** — normalize com `raw.replace(/\D/g, '').slice(-12)`.

#### POST /oportunidades

```json
{
  "Nombre_oportunidad": "João Silva - Curso Avançado",
  "Numero_identificacion_asesor": "00000"
}
```

Cria automaticamente 1 `Negocio_favorito` em estado inicial do pipeline (Presentación).

#### POST /actividades

Registra interação vinculada a um negocio. **Todos os campos abaixo são obrigatórios:**

```json
{
  "Consecutivo_negocio": 6,
  "Estado_actividad": "C",
  "Tipo_actividad": "WhatsApp",
  "Numero_identificacion_asesor": "00000",
  "Fecha_actividad": "2026-04-20",
  "Resultado_actividad": "Cliente interessado, agendar visita"
}
```

Enum `Estado_actividad` (códigos de 1 letra, **não o label visível**):
- `"C"` = Completada → também exige `Resultado_actividad`
- `"P"` = Programada → também exige `Descripcion_actividad`

Enum `Tipo_actividad` (valores descobertos via screenshot da UI):
- `"Llamada"`, `"WhatsApp"`, `"Correo"`, `"Nota"`, `"Reunión"`

⚠️ Mandar o label visível (`"Completada"` em vez de `"C"`) retorna **400** "El campo Estado_actividad es inválido". O mesmo vale para `Tipo_resultado` se o tenant tiver enum customizado.

#### POST /estudiantes

```json
{
  "Primer_nombre": "Cristian",
  "Primer_apellido": "Reyes",
  "Codigo_tipo_identificacion": "CR01",
  "Numero_identificacion": "208120496",
  "Genero": "M",
  "Email": "x@y.com",
  "Celular": "50660528900",
  "Fecha_nacimiento": "2000-12-29",
  "Codigo_programa": "01"
}
```

#### POST /inscripciones

Schema mínimo é só `Codigo_estudiante`, mas na prática envie também `Codigo_programa` e `Consecutivo_periodo` (inteiro, **não** `Codigo_periodo`).

#### POST /matriculasProgramas

Fluxo mais complexo — **8 campos obrigatórios:**

```json
{
  "Consecutivo_inscripcion": 123,
  "Codigo_estudiante": "...",
  "Fecha_matricula": "2026-04-20",
  "Consecutivo_sede_jornada": 1,
  "Consecutivo_periodo": 2,
  "Codigo_nivel": "01",
  "Condicion_matricula": "N",
  "Formalizada": true
}
```

Enum `Condicion_matricula` (GET `/condicionesMatricula?Estado=true` retorna a lista — 13 valores neste tenant):

| Codigo | Nombre |
|---|---|
| `N` | Nuevo |
| `RG` | Antiguo |
| `RI` | Reingresante |
| `TE` | Transferencia Externa |
| `TI` | Transferencia Interna |
| `CP` | Ciclo propedéutico |
| `DP` | Doble Programa |
| `EA` | Estudiante de Articulación |
| `SPP` | Estudiantes SPP |
| `OG` | Opción de grado |
| `IA` | Semestre de intercambio académico |
| `ES` | Transferencia entre seccionales |
| `TC` | Co-Titulación o Titulación Conjunta |

**API quer o `Codigo` (1-3 letras), não o `Nombre`.**

#### POST /ordenespago

⚠️ **Bloqueado em tenants sem modelo financeiro ativo.** Retorna:
```json
{"code":"400","message":"La API no aplica para el modelo financiero de la institución."}
```

O plugin detecta essa mensagem e mostra aviso ao invés de quebrar o fluxo.

---

## Pipeline CRM (estados do negocio)

`GET /flujonegocios?Estado=true` retorna 5 estados padrão:

| `Consecutivo_estado_negocio` | Nombre | Porcentaje |
|---|---|---|
| 1 | Perdido | 0 |
| 2 | Presentación | 20 |
| 4 | En negociación | 50 |
| 3 | Cierre | 80 |
| 5 | Ganado | 100 |

Transições:
- `PATCH /negocios/estado` — mover entre estados não-terminais
- `PUT /negocios/estado/ganar` — marca como Ganado
- `PUT /negocios/estado/perder` — marca como Perdido (exige `Consecutivo_causa_perdida` de `/causas`)

---

## Metodologia de descoberta de schema

Quando a doc oficial não lista campos obrigatórios, use esta receita:

1. **`POST /{endpoint}` com body `{}`** — retorna 400 listando os campos obrigatórios.
   ```bash
   curl -X POST -H "X-Q10-Key: $KEY" -H "Content-Type: application/json" \
     -d '{}' "$BASE/actividades"
   # {"code":"400","message":"Los siguientes campos son obligatorios: Consecutivo_negocio, Estado_actividad, ..."}
   ```

2. **POST com placeholder em campo enum** — se retornar "es inválido", o nome do campo está certo mas o valor é restrito. Procure endpoint de catálogo correspondente (ex.: `Condicion_matricula` → `/condicionesMatricula`).

3. **POST com um campo por vez** — cada 400 revela o próximo campo faltando. Itere até passar.

4. **Se enum não tem endpoint** (ex.: `Estado_actividad`, `Tipo_actividad`), extraia da UI Q10 com screenshot do formulário de criação. **A API espera `Codigo` (geralmente 1-3 letras), não o label visível.**

---

## Pegadinhas documentadas

- **`/estudiantes` (lista) → 404** no proxy. Use `/estudiantes/{id}` individual ou filtre `/usuarios` por role `"Estudiante"`.
- **`/paises` → 404** no tenant testado. Use valores hardcoded se precisar.
- **`/sedes-jornadas` (com hífen) → 404.** O endpoint certo é `/sedesjornadas`.
- **`/annoslectivos` → 400** em instituições ETDH/Superior (só aplica a colegios).
- **`/facturas`, `/ordenespago`, `/estadocuentaestudiantes` → 400** se tenant não tem módulo financeiro.
- **`Tipo_detalle` em contactos:** só `"Celular"` e `"Email"`. `"Telefono"` é silenciosamente aceito mas não persiste no Q10.
- **Nomes de asesor podem ter acentos HTML-quebráveis** (ex.: `Vitor Falcão`) — sempre escape antes de renderizar.

---

## Referências

- Doc oficial: `https://developer.q10.com/api-details#api=jack-api` (Azure APIM, requer login + JS)
- Export completo local: `~/Downloads/Q10-JACK-API.md` (179 operações listadas)
