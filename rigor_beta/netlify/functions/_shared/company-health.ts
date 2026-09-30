type QueueRecord = { status?: string };
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
