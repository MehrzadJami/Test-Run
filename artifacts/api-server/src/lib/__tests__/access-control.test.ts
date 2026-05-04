import { describe, expect, it } from "vitest";
import {
  SEEDED_DEMO_PROJECT_NAME,
  canMutateProject,
  canViewProject,
  isSeededDemoProject,
} from "../access-control";

describe("access-control helpers", () => {
  it("does not treat ownerless legacy projects as world-mutable", () => {
    expect(
      canMutateProject(
        { ownerId: null, visibility: "public", name: "Legacy project" },
        "user-1",
      ),
    ).toBe(false);
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

  it("allows viewing public projects without allowing mutation", () => {
    const project = {
      ownerId: null,
      visibility: "public",
      name: "Public ownerless project",
    };

    expect(canViewProject(project, undefined)).toBe(true);
    expect(canMutateProject(project, undefined)).toBe(false);
  });
});
