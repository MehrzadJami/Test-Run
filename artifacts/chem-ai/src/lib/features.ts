const env = import.meta.env;

function flag(name: string, fallback: boolean): boolean {
  const raw = env[name as keyof ImportMetaEnv];
  if (raw == null || raw === "") return fallback;
  return String(raw).toLowerCase() === "true";
}

export const features = {
  auth: flag("VITE_FEATURE_AUTH", false),
  multisource: flag("VITE_FEATURE_MULTISOURCE", false),
  inlineEditing: flag("VITE_FEATURE_INLINE_EDITING", true),
  auditTrail: flag("VITE_FEATURE_AUDIT_TRAIL", true),
  pdfUpload: flag("VITE_FEATURE_PDF_UPLOAD", true),
  notebookExport: flag("VITE_FEATURE_NOTEBOOK_EXPORT", true),
  realAI: flag("VITE_FEATURE_REAL_AI", false),
  experimentalFitting: flag("VITE_FEATURE_EXPERIMENTAL_FITTING", false),
} as const;
