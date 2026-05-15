/**
 * API route integration tests.
 *
 * Strategy: import the Express app directly (same as production) and use
 * supertest to drive HTTP requests. The real PostgreSQL DATABASE_URL is
 * available in the Replit environment, so we test against the live DB
 * (isolated by creating test projects that are cleaned up after each suite).
 *
 * No real AI keys are needed — all extractions use MockProvider because
 * OPENAI_API_KEY and GEMINI_API_KEY are unset in CI.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../app";
import { db, projectsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createSession, deleteSession } from "../../lib/auth";
import type { AuthUser } from "@workspace/api-zod";

const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ownerUser: AuthUser = {
  id: `test-owner-${testRunId}`,
  email: `owner-${testRunId}@example.com`,
  firstName: "Owner",
  lastName: "User",
  profileImageUrl: null,
};
const otherUser: AuthUser = {
  id: `test-other-${testRunId}`,
  email: `other-${testRunId}@example.com`,
  firstName: "Other",
  lastName: "User",
  profileImageUrl: null,
};
let ownerSid = "";
let otherSid = "";

function ownerAuth(): string {
  return `Bearer ${ownerSid}`;
}

function otherAuth(): string {
  return `Bearer ${otherSid}`;
}

beforeAll(async () => {
  await db.insert(usersTable).values([ownerUser, otherUser]);
  ownerSid = await createSession({
    user: ownerUser,
    access_token: "test-owner-token",
  });
  otherSid = await createSession({
    user: otherUser,
    access_token: "test-other-token",
  });
});

afterAll(async () => {
  if (ownerSid) await deleteSession(ownerSid);
  if (otherSid) await deleteSession(otherSid);
  await db.delete(projectsTable).where(eq(projectsTable.ownerId, ownerUser.id));
  await db.delete(projectsTable).where(eq(projectsTable.ownerId, otherUser.id));
  await db.delete(usersTable).where(eq(usersTable.id, ownerUser.id));
  await db.delete(usersTable).where(eq(usersTable.id, otherUser.id));
});

// ─── GET /api/healthz ─────────────────────────────────────────────────────────

describe("GET /api/healthz", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});

// ─── GET /api/projects ────────────────────────────────────────────────────────

describe("GET /api/projects", () => {
  it("returns 200 with an array", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─── POST /api/projects ───────────────────────────────────────────────────────

describe("POST /api/projects", () => {
  const created: number[] = [];

  afterAll(async () => {
    for (const id of created) {
      await request(app)
        .delete(`/api/projects/${id}`)
        .set("Authorization", ownerAuth());
    }
  });

  it("creates a project and returns 201 with id", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", ownerAuth())
      .send({ name: "Test project M15" });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe("number");
    created.push(res.body.id);
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(app).post("/api/projects").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("stores description when provided", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", ownerAuth())
      .send({ name: "With desc", description: "test desc" });
    expect(res.status).toBe(201);
    expect(res.body.description).toBe("test desc");
    created.push(res.body.id);
  });
});

// ─── POST /api/projects/:id/sources + extraction + model-card + export ────────

describe("Full project lifecycle", () => {
  let projectId: number;
  let sourceId: number;
  let variableId: number;

  const SOURCE_TEXT = `Monod Chemostat Model — Andrews (1968)

The chemostat is a continuous culture device operating at steady state.
Cell growth follows Monod kinetics with substrate inhibition.

State variables: X (biomass, g/L), S (substrate, g/L).
Parameters: mu_max = 0.53 1/h, Ks = 0.12 g/L, D = 0.3 1/h.
Equations: dX/dt = (mu - D)*X, dS/dt = D*(S0 - S) - mu*X/Y.
Assumptions: perfectly mixed, isothermal, constant volume.
`;

  beforeAll(async () => {
    const proj = await request(app)
      .post("/api/projects")
      .set("Authorization", ownerAuth())
      .send({ name: "Lifecycle test M15" });
    projectId = proj.body.id;
  });

  afterAll(async () => {
    if (projectId) {
      await request(app)
        .delete(`/api/projects/${projectId}`)
        .set("Authorization", ownerAuth());
    }
  });

  it("POST /api/projects/:id/sources — creates source document", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/sources`)
      .set("Authorization", ownerAuth())
      .send({ kind: "text", content: SOURCE_TEXT });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    sourceId = res.body.id;
  });

  it("POST /api/projects/:id/sources — returns 409 for a second source", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/sources`)
      .set("Authorization", ownerAuth())
      .send({ kind: "text", content: `${SOURCE_TEXT}\nSecond upload.` });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(
      "This project already has a source document. Multi-source aggregation is not enabled yet. Create a new project for another source.",
    );
  });

  it("POST /api/projects/:id/sources — returns 404 for unknown project", async () => {
    const res = await request(app)
      .post(`/api/projects/999999/sources`)
      .set("Authorization", ownerAuth())
      .send({ kind: "text", content: SOURCE_TEXT });
    expect(res.status).toBe(404);
  });

  it("POST /api/projects/:id/sources — returns 400 when content missing", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/sources`)
      .set("Authorization", ownerAuth())
      .send({ kind: "text" });
    expect(res.status).toBe(400);
  });

  it("POST /api/projects/:id/sources — persists PDF structuredDocument with chunks", async () => {
    const pdfProject = await request(app)
      .post("/api/projects")
      .set("Authorization", ownerAuth())
      .send({ name: "Structured PDF source M43" });
    const pdfProjectId = pdfProject.body.id;
    const structuredDocument = {
      title_guess: "Structured PDF Acceptance Fixture",
      page_count: 2,
      pages: [
        {
          page_number: 1,
          text: "Abstract text",
          char_count: 13,
          word_count: 2,
          has_equation_like_text: false,
          has_table_like_text: false,
        },
      ],
      sections: [
        {
          heading: "Materials and Methods",
          page_start: 2,
          page_end: 2,
          text: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2).",
        },
      ],
      chunks: [
        {
          chunk_id: "pdf_001",
          page_start: 2,
          page_end: 2,
          section_heading: "Materials and Methods",
          text: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2).",
          char_count: 61,
          contains_equation_like_text: true,
          contains_table_like_text: false,
          contains_figure_reference: false,
        },
      ],
      diagnostics: {
        text_quality: "good",
        fallback_required: false,
        message: null,
        warnings: [],
      },
    };

    const sourceRes = await request(app)
      .post(`/api/projects/${pdfProjectId}/sources`)
      .set("Authorization", ownerAuth())
      .send({
        kind: "pdf",
        filename: "acceptance.pdf",
        content: "The oxygen balance is dC_O2/dt = kLa*(Cstar_O2 - C_O2).",
        structuredDocument,
      });

    expect(sourceRes.status).toBe(201);
    expect(sourceRes.body.kind).toBe("pdf");
    expect(sourceRes.body.structuredDocument.chunks[0]).toMatchObject({
      chunk_id: "pdf_001",
      page_start: 2,
      section_heading: "Materials and Methods",
      contains_equation_like_text: true,
    });

    const projectRes = await request(app)
      .get(`/api/projects/${pdfProjectId}`)
      .set("Authorization", ownerAuth());
    expect(projectRes.status).toBe(200);
    expect(projectRes.body.sourceDocuments[0]).toMatchObject({
      kind: "pdf",
      filename: "acceptance.pdf",
    });
    expect(projectRes.body.sourceDocuments[0].structuredDocument.chunks[0].section_heading)
      .toBe("Materials and Methods");

    await request(app)
      .delete(`/api/projects/${pdfProjectId}`)
      .set("Authorization", ownerAuth());
  });

  it("POST /api/projects/:id/extractions — runs mock extraction and returns 201", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/extractions`)
      .set("Authorization", ownerAuth())
      .send({ provider: "mock", sourceDocumentId: sourceId });
    expect(res.status).toBe(201);
    expect(res.body.extraction).toBeDefined();
    expect(res.body.extraction.providerUsed).toBe("mock");
  });

  it("POST /api/projects/:id/extractions — returns 404 for unknown project", async () => {
    const res = await request(app)
      .post(`/api/projects/999999/extractions`)
      .set("Authorization", ownerAuth())
      .send({ provider: "mock" });
    expect(res.status).toBe(404);
  });

  it("POST /api/projects/:id/extractions — returns 400 when no source exists", async () => {
    const emptyProj = await request(app)
      .post("/api/projects")
      .set("Authorization", ownerAuth())
      .send({ name: "Empty proj M15" });
    const emptyId = emptyProj.body.id;
    const res = await request(app)
      .post(`/api/projects/${emptyId}/extractions`)
      .set("Authorization", ownerAuth())
      .send({ provider: "mock" });
    expect(res.status).toBe(400);
    await request(app)
      .delete(`/api/projects/${emptyId}`)
      .set("Authorization", ownerAuth());
  });

  it("GET /api/projects/:id/model-card — returns model card after extraction", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/model-card`)
      .set("Authorization", ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.extraction).toBeDefined();
    expect(res.body.equations).toBeDefined();
    expect(res.body.variables).toBeDefined();
    expect(res.body.parameters).toBeDefined();
    expect(res.body.assumptions).toBeDefined();
    variableId = res.body.variables[0]?.id;
  });

  it("PATCH /api/variables/:id — returns 403 for a non-owner", async () => {
    expect(typeof variableId).toBe("number");
    const res = await request(app)
      .patch(`/api/variables/${variableId}`)
      .set("Authorization", otherAuth())
      .send({ name: "Unauthorized edit" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Access denied");
  });

  it("PATCH /api/variables/:id — allows the project owner", async () => {
    expect(typeof variableId).toBe("number");
    const res = await request(app)
      .patch(`/api/variables/${variableId}`)
      .set("Authorization", ownerAuth())
      .send({ name: "Verified biomass concentration" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Verified biomass concentration");
    expect(res.body.editedByUser).toBe(true);
  });

  it("POST /api/variables/:id/reset — returns 403 for a non-owner", async () => {
    expect(typeof variableId).toBe("number");
    const res = await request(app)
      .post(`/api/variables/${variableId}/reset`)
      .set("Authorization", otherAuth());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Access denied");
  });

  it("GET /api/projects/:id/model-card — returns 404 for unknown project", async () => {
    const res = await request(app).get(`/api/projects/999999/model-card`);
    expect(res.status).toBe(404);
  });

  it("GET /api/projects/:id/export — returns structured export JSON", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/export`)
      .set("Authorization", ownerAuth());
    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();
    expect(res.body.sourceDocuments).toBeDefined();
    expect(res.body.modelCards).toBeDefined();
    expect(res.body.exportedAt).toBeDefined();
  });

  it("GET /api/projects/:id/export — returns 404 for unknown project", async () => {
    const res = await request(app).get(`/api/projects/999999/export`);
    expect(res.status).toBe(404);
  });

  it("GET /api/export — is disabled unless explicitly enabled", async () => {
    const previous = process.env.ENABLE_FULL_EXPORT;
    process.env.ENABLE_FULL_EXPORT = "false";
    const res = await request(app).get(`/api/export`);
    expect(res.status).toBe(404);
    if (previous === undefined) {
      delete process.env.ENABLE_FULL_EXPORT;
    } else {
      process.env.ENABLE_FULL_EXPORT = previous;
    }
  });

  it("GET /api/export — returns full export in development when explicitly enabled", async () => {
    const previous = process.env.ENABLE_FULL_EXPORT;
    process.env.ENABLE_FULL_EXPORT = "true";
    const res = await request(app).get(`/api/export`);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe("1");
    expect(typeof res.body.projectCount).toBe("number");
    expect(Array.isArray(res.body.data)).toBe(true);
    if (previous === undefined) {
      delete process.env.ENABLE_FULL_EXPORT;
    } else {
      process.env.ENABLE_FULL_EXPORT = previous;
    }
  });
});

// ─── POST /api/pdf/parse ─────────────────────────────────────────────────────

describe("POST /api/pdf/parse", () => {
  it("returns 400 when base64 is missing", async () => {
    const res = await request(app).post("/api/pdf/parse").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when base64 is not a real PDF", async () => {
    const fakeBase64 = Buffer.from("this is not a pdf").toString("base64");
    const res = await request(app)
      .post("/api/pdf/parse")
      .send({ base64: fakeBase64 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("accepts data-url style base64 payload shape (normalizes prefix)", async () => {
    const fakeDataUrl = `data:application/pdf;base64,${Buffer.from("not a pdf").toString("base64")}`;
    const res = await request(app)
      .post("/api/pdf/parse")
      .send({ base64: fakeDataUrl });
    // Normalization should happen; parsing still fails because content is not a real PDF.
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when base64 field is empty string", async () => {
    const res = await request(app).post("/api/pdf/parse").send({ base64: "" });
    expect(res.status).toBe(400);
  });
});
