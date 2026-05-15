export type ExtractionSubmitStep =
  | "idle"
  | "creating_project"
  | "saving_source"
  | "extracting_model"
  | "opening_model_card";

export function tryAcquireSubmitLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseSubmitLock(lock: { current: boolean }): void {
  lock.current = false;
}

export function extractionSubmitStepLabel(step: ExtractionSubmitStep): string {
  switch (step) {
    case "creating_project":
      return "Creating project...";
    case "saving_source":
      return "Saving source...";
    case "extracting_model":
      return "Extracting model...";
    case "opening_model_card":
      return "Opening model card...";
    case "idle":
    default:
      return "";
  }
}
