import { describe, expect, it } from "vitest";

import {
  extractionSubmitStepLabel,
  releaseSubmitLock,
  tryAcquireSubmitLock,
} from "../extraction-submit-guard";

describe("extraction submit guard", () => {
  it("ignores duplicate submit attempts while locked", () => {
    const lock = { current: false };

    expect(tryAcquireSubmitLock(lock)).toBe(true);
    expect(tryAcquireSubmitLock(lock)).toBe(false);
  });

  it("releases the lock after failure", () => {
    const lock = { current: false };

    expect(tryAcquireSubmitLock(lock)).toBe(true);
    releaseSubmitLock(lock);
    expect(tryAcquireSubmitLock(lock)).toBe(true);
  });

  it("labels the extraction submit steps", () => {
    expect(extractionSubmitStepLabel("creating_project")).toBe("Creating project...");
    expect(extractionSubmitStepLabel("saving_source")).toBe("Saving source...");
    expect(extractionSubmitStepLabel("extracting_model")).toBe("Extracting model...");
    expect(extractionSubmitStepLabel("opening_model_card")).toBe("Opening model card...");
  });
});
