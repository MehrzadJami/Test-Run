# API Reference

Base path: `/api`

All requests go through the shared reverse proxy at `localhost:80`. Do not call service ports directly.

Content-Type for all POST requests: `application/json`

---

## Health

### `GET /api/healthz`

Returns 200 when the API server is reachable and the database connection is live.

**Response 200**
```json
{ "status": "ok" }
```

---

## Projects

### `GET /api/projects`

List all projects with computed summary fields.

**Response 200** — array of project summary objects
```json
[
  {
    "id": 1,
    "name": "Chemostat — microalgae bioreactor (Andrews 1968)",
    "description": "",
    "createdAt": "2026-05-02T12:00:00.000Z",
    "updatedAt": "2026-05-02T12:00:00.000Z",
    "sourceDocumentCount": 1,
    "extractionCount": 1,
    "latestExtractionTitle": "Continuous chemostat — substrate-limited microalgae growth"
  }
]
```

---

### `POST /api/projects`

Create a new project.

**Request body**
```json
{
  "name": "CSTR isothermal model",
  "description": "Optional project description"
}
```

**Response 201** — created project row
```json
{
  "id": 2,
  "name": "CSTR isothermal model",
  "description": "",
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Response 400** — validation error

---

### `GET /api/projects/:projectId`

Retrieve a project with all its source documents and extraction summaries.

**Response 200**
```json
{
  "id": 1,
  "name": "...",
  "description": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "sourceDocuments": [
    {
      "id": 1,
      "projectId": 1,
      "kind": "text",
      "filename": null,
      "content": "...",
      "createdAt": "..."
    }
  ],
  "extractions": [
    {
      "id": 1,
      "projectId": 1,
      "sourceDocumentId": 1,
      "providerUsed": "mock",
      "status": "ready",
      "modelCardTitle": "Continuous chemostat — ...",
      "domain": "biochemical_engineering",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

**Response 404** — project not found

---

### `DELETE /api/projects/:projectId`

Delete a project and all its associated data (cascade).

**Response 204** — no content

**Response 404** — project not found

---

## Source Documents

### `POST /api/projects/:projectId/sources`

Attach a source document (text or PDF content) to a project.

**Request body**
```json
{
  "kind": "text",
  "content": "dX/dt = (mu - D)*X where mu = mumax*S/(Ks+S)...",
  "filename": null
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `kind` | string | Yes | `"text"` or `"pdf"` |
| `content` | string | Yes | Raw text content |
| `filename` | string \| null | No | Original filename if uploaded |

**Response 201** — created source document row

**Response 404** — project not found

---

## Extractions

### `POST /api/projects/:projectId/extractions`

Run an extraction on the most recent source document attached to the project.

**Request body** (all optional)
```json
{
  "sourceDocumentId": 1
}
```

If `sourceDocumentId` is omitted, the most recently created source document for the project is used.

**Processing steps:**
1. Input validation (minimum text length check)
2. Provider selection (`getActiveProvider()`)
3. Provider extraction → raw response
4. `ExtractionResultSchema` Zod validation
5. `mapExtractionToDb()` mapping
6. Atomic DB transaction (extraction + equations + variables + parameters + assumptions)

**Response 201** — full model card
```json
{
  "extraction": {
    "id": 1,
    "projectId": 1,
    "sourceDocumentId": 1,
    "providerUsed": "mock",
    "status": "ready",
    "modelCardTitle": "...",
    "domain": "biochemical_engineering",
    "systemDescription": "...",
    "problemStatement": "...",
    "odeTemplate": "...",
    "rawExtractionJson": { ... },
    "createdAt": "...",
    "updatedAt": "..."
  },
  "equations": [ ... ],
  "variables": [ ... ],
  "parameters": [ ... ],
  "assumptions": [ ... ]
}
```

**Response 400** — input too short or validation error

**Response 502** — provider error (malformed provider response)

**Response 500** — database persistence failure

---

## Model Card

### `GET /api/projects/:projectId/model-card`

Retrieve the most recent model card (extraction + all structured data) for a project.

**Response 200** — same shape as the extraction creation response (201 above)

**Response 404** — no extraction exists for this project

---

## Export

### `GET /api/projects/:projectId/export`

Export the full project as a structured JSON document — all source documents and all model cards, suitable for archiving or downstream processing.

**Response 200**
```json
{
  "project": { ... },
  "sourceDocuments": [ ... ],
  "modelCards": [
    {
      "extraction": { ... },
      "equations": [ ... ],
      "variables": [ ... ],
      "parameters": [ ... ],
      "assumptions": [ ... ]
    }
  ],
  "exportedAt": "2026-05-02T12:00:00.000Z"
}
```

**Response 404** — project not found

---

## Error Responses

All error responses follow a consistent shape:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|---|---|
| 400 | Bad request — validation error or missing required field |
| 404 | Resource not found |
| 500 | Unexpected server or database error |
| 502 | Extraction provider returned an invalid response |

---

## Smoke Test Sequence

```bash
# 1. Health check
curl localhost:80/api/healthz

# 2. Create project
curl -X POST localhost:80/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Test project","description":""}'
# → {"id":2, ...}

# 3. Add source
curl -X POST localhost:80/api/projects/2/sources \
  -H "Content-Type: application/json" \
  -d '{"kind":"text","content":"dX/dt = (mu-D)*X, dS/dt = D*(Sin-S)-(mu/Yxs)*X, mu=mumax*S/(Ks+S)"}'

# 4. Run extraction
curl -X POST localhost:80/api/projects/2/extractions \
  -H "Content-Type: application/json" \
  -d '{}'

# 5. Retrieve model card
curl localhost:80/api/projects/2/model-card | python3 -m json.tool

# 6. Export full project JSON
curl localhost:80/api/projects/2/export | python3 -m json.tool
```
