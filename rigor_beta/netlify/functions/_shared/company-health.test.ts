import { describe, expect, it } from "vitest";
import { companyActionCounts } from "./company-health.js";

describe("company health queue counts", () => {
  it("reports completed execution rather than obsolete pulse approval counts", () => {
    expect(companyActionCounts([{ status: "COMPLETE" }], {
      total: 2, approved: 1, executing: 1,
    })).toEqual({ total: 1, approved: 0, needs_founder_approval: 0,
      executing: 0, complete: 1, failed: 0 });
  });
  it("preserves an empty durable queue instead of resurrecting old work", () => {
    expect(companyActionCounts([], { total: 5, approved: 3, failed: 2 }))
      .toEqual({ total: 0, approved: 0, needs_founder_approval: 0,
        executing: 0, complete: 0, failed: 0 });
  });
  it("exposes failures independently from work waiting for founder approval", () => {
    expect(companyActionCounts([{ status: "FAILED" }, { status: "NEEDS_APPROVAL" }]))
      .toMatchObject({ total: 2, failed: 1, needs_founder_approval: 1, executing: 0 });
  });
  it("uses sanitized pulse counts only when the durable queue is unavailable", () => {
    expect(companyActionCounts(null, { total: 3, complete: 2, failed: 1,
      approved: -1, executing: Number.NaN }))
      .toEqual({ total: 3, approved: 0, needs_founder_approval: 0,
        executing: 0, complete: 2, failed: 1 });
  });
});
