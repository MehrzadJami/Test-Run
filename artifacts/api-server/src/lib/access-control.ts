import type { AuthUser } from "@workspace/api-zod";

export const SEEDED_DEMO_PROJECT_NAME =
  "Chemostat — microalgae bioreactor (Andrews 1968)";

export type ProjectAccessRow = {
  ownerId: string | null;
  visibility?: string | null;
  name?: string | null;
};

function parseEnvList(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isSeededDemoProject(project: { name?: string | null }): boolean {
  return project.name === SEEDED_DEMO_PROJECT_NAME;
}

export function canViewProject(
  project: ProjectAccessRow,
  userId: string | undefined,
): boolean {
  if (project.visibility === "public") return true;
  return !!userId && project.ownerId === userId;
}

export function canMutateProject(
  project: ProjectAccessRow,
  userId: string | undefined,
): boolean {
  if (isSeededDemoProject(project)) return false;
  if (!project.ownerId) return false;
  return !!userId && project.ownerId === userId;
}

export function isAdminUser(user: AuthUser | undefined): boolean {
  if (!user) return false;
  const adminIds = parseEnvList("ADMIN_USER_IDS");
  const adminEmails = parseEnvList("ADMIN_EMAILS");
  return (
    adminIds.has(user.id) ||
    (!!user.email && adminEmails.has(user.email))
  );
}

export function isFullExportEnabled(): boolean {
  return process.env["ENABLE_FULL_EXPORT"] === "true";
}
