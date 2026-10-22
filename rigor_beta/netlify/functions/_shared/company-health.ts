type QueueRecord = { status?: string };
export type PulseAttempt = {
  started_at: string;
  completed_at?: string;
  status: "RUNNING" | "COMPLETE" | "FAILED";
  failure_code?: string;
};

// A previous successful pulse does not hide a more recent failed invocation.
export function companyPulseHealth(attempt: PulseAttempt | null, latestAt?: string, now = Date.now()) {
  const newerAttempt = attempt && (!latestAt || attempt.started_at >= latestAt);
  const timedOut = newerAttempt && attempt.status === "RUNNING"
    && now - Date.parse(attempt.started_at) > 15 * 60 * 1000;
  const failed = Boolean(newerAttempt && (attempt.status === "FAILED" || timedOut));
  return {
    status: failed ? "degraded" : "ok",
    latest_attempt_status: timedOut ? "TIMED_OUT" : attempt?.status || null,
    latest_attempt_at: attempt?.started_at || null,
    latest_attempt_failure: failed ? (timedOut ? "PULSE_TIMEOUT" : attempt?.failure_code || "PULSE_FAILED") : null,
  };
}
type QueueCounts = {
  total?: number;
  approved?: number;
  needs_founder_approval?: number;
  executing?: number;
  complete?: number;
  failed?: number;
};

// A stored queue, including an empty queue, is authoritative over pulse metadata.
export function companyActionCounts(queue: unknown, fallback?: QueueCounts) {
  if (Array.isArray(queue)) {
    const records = queue as QueueRecord[];
    const count = (status: string) => records.filter((item) => item?.status === status).length;
    return {
      total: records.length,
      approved: count("APPROVED"),
      needs_founder_approval: count("NEEDS_APPROVAL"),
      executing: count("EXECUTING"),
      complete: count("COMPLETE"),
      failed: count("FAILED"),
    };
  }
  const count = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  };
  return {
    total: count(fallback?.total),
    approved: count(fallback?.approved),
    needs_founder_approval: count(fallback?.needs_founder_approval),
    executing: count(fallback?.executing),
    complete: count(fallback?.complete),
    failed: count(fallback?.failed),
  };
}
