import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SEEDED_DEMO_PROJECT_NAME,
  canMutateProject,
  canViewProject,
  isSeededDemoProject,
} from "../access-control";

describe("access-control helpers", () => {
  it("does not treat ownerless legacy projects as world-mutable to authenticated users", () => {
    expect(
      canMutateProject(
        { ownerId: null, visibility: "public", name: "Legacy project" },
        "user-1",
      ),
    ).toBe(false);
  });

  describe("anonymous mutation of ownerless projects", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDevFlag = process.env.DEV_ALLOW_ANONYMOUS_MUTATIONS;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalDevFlag === undefined) {
        delete process.env.DEV_ALLOW_ANONYMOUS_MUTATIONS;
      } else {
        process.env.DEV_ALLOW_ANONYMOUS_MUTATIONS = originalDevFlag;
      }
    });

    it("denies mutation when DEV_ALLOW_ANONYMOUS_MUTATIONS is not set, even in dev", () => {
      process.env.NODE_ENV = "development";
      delete process.env.DEV_ALLOW_ANONYMOUS_MUTATIONS;
      expect(
        canMutateProject(
          { ownerId: null, visibility: "public", name: "Anonymous local project" },
          undefined,
        ),
      ).toBe(false);
    });

    it("denies mutation in production even with DEV_ALLOW_ANONYMOUS_MUTATIONS=true", () => {
      process.env.NODE_ENV = "production";
      process.env.DEV_ALLOW_ANONYMOUS_MUTATIONS = "true";
      expect(
        canMutateProject(
          { ownerId: null, visibility: "public", name: "Anonymous local project" },
          undefined,
        ),
      ).toBe(false);
    });

    it("allows anonymous mutation only when both NODE_ENV!=production and DEV_ALLOW_ANONYMOUS_MUTATIONS=true", () => {
      process.env.NODE_ENV = "development";
      process.env.DEV_ALLOW_ANONYMOUS_MUTATIONS = "true";
      expect(
        canMutateProject(
          { ownerId: null, visibility: "public", name: "Anonymous local project" },
          undefined,
        ),
      ).toBe(true);
    });
  });

  it("allows mutation only for the owning user", () => {
    const project = {
      ownerId: "owner-1",
      visibility: "private",
      name: "Owned project",
    };

    expect(canMutateProject(project, "owner-1")).toBe(true);
    expect(canMutateProject(project, "other-1")).toBe(false);
    expect(canMutateProject(project, undefined)).toBe(false);
  });

  it("prevents mutation of the seeded demo project", () => {
    const project = {
      ownerId: "owner-1",
      visibility: "public",
      name: SEEDED_DEMO_PROJECT_NAME,
    };

    expect(isSeededDemoProject(project)).toBe(true);
    expect(canMutateProject(project, "owner-1")).toBe(false);
  });

  it("allows viewing public projects; anonymous mutation requires explicit opt-in", () => {
    const project = {
      ownerId: null,
      visibility: "public",
      name: "Public ownerless project",
    };

    expect(canViewProject(project, undefined)).toBe(true);
    // Without DEV_ALLOW_ANONYMOUS_MUTATIONS, anonymous mutation is always denied
    delete process.env.DEV_ALLOW_ANONYMOUS_MUTATIONS;
    expect(canMutateProject(project, undefined)).toBe(false);
    expect(canMutateProject(project, "user-1")).toBe(false);
  });
});
