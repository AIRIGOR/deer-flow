import { describe, expect, it } from "vitest";
import { companyActionCounts, companyPulseHealth } from "./company-health.js";

describe("company pulse health", () => {
  it("does not hide a failed cycle behind an old successful pulse", () => {
    expect(companyPulseHealth({started_at: "2026-09-30T21:00:00Z", status: "FAILED", failure_code: "UPSTREAM_HTTP_401"}, "2026-09-29T15:00:00Z"))
      .toMatchObject({status: "degraded", latest_attempt_failure: "UPSTREAM_HTTP_401"});
  });
  it("clears degraded health after a newer successful cycle", () => {
    expect(companyPulseHealth({started_at: "2026-09-29T15:00:00Z", status: "FAILED"}, "2026-09-30T21:00:00Z"))
      .toMatchObject({status: "ok", latest_attempt_failure: null});
  });
  it("marks an abandoned background invocation as timed out", () => {
    expect(companyPulseHealth({started_at: "2026-09-30T21:00:00Z", status: "RUNNING"}, undefined, Date.parse("2026-09-30T21:16:00Z")))
      .toMatchObject({status: "degraded", latest_attempt_status: "TIMED_OUT"});
  });
  it("keeps a current running cycle distinct from a failed cycle", () => {
    expect(companyPulseHealth({started_at: "2026-09-30T21:00:00Z", status: "RUNNING"}, undefined, Date.parse("2026-09-30T21:01:00Z")))
      .toMatchObject({status: "ok", latest_attempt_status: "RUNNING"});
  });
});

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
