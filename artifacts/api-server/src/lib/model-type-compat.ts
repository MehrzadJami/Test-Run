import { normalizeModelType } from "@workspace/domain-classifier";

type ExtractionModelTypeFields = {
  modelType?: string | null;
  modelTypeOverride?: string | null;
  rawExtractionJson?: unknown;
};

function normalizeRawExtractionJson(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const typed = raw as Record<string, unknown>;
  if (typeof typed["model_type"] !== "string") return raw;
  return {
    ...typed,
    model_type: normalizeModelType(typed["model_type"]),
  };
}

export function normalizeExtractionModelTypes<T extends ExtractionModelTypeFields>(
  extraction: T,
): T {
  return {
    ...extraction,
    modelType: normalizeModelType(extraction.modelType),
    modelTypeOverride:
      extraction.modelTypeOverride == null
        ? null
        : normalizeModelType(extraction.modelTypeOverride),
    rawExtractionJson: normalizeRawExtractionJson(extraction.rawExtractionJson),
  };
}
