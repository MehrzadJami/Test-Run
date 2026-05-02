/**
 * Hand-written Zod schemas for mobile auth endpoints.
 * Orval generates TypeScript interfaces for these (in generated/types/) but
 * not Zod schemas, because the OpenAPI spec uses named component refs that
 * don't match Orval's operationId + Body/Response naming heuristic.
 */
import * as zod from "zod";

export const ExchangeMobileAuthorizationCodeBody = zod.object({
  code: zod.string(),
  code_verifier: zod.string(),
  redirect_uri: zod.string(),
  state: zod.string(),
  nonce: zod.string().nullable().optional(),
});

export const ExchangeMobileAuthorizationCodeResponse = zod.object({
  token: zod.string(),
});

export const LogoutMobileSessionResponse = zod.object({
  success: zod.boolean(),
});
