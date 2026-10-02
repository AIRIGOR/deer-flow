// The backend accepts at most 30,000 context characters. Keep full history in
// storage; compact only the model request and disclose omitted context.
export function boundedCompanyContext(context: Record<string, unknown>, limit = 30000): string {
  const original = JSON.stringify(context);
  if (original.length <= limit) return original;
  const records = Array.isArray(context.durable_company_state) ? context.durable_company_state : [];
  const actions = Array.isArray(context.durable_action_queue) ? context.durable_action_queue : [];
  const withoutPayload = (item: Record<string, unknown>) => {
    const {payload: _payload, ...summary} = item;
    return summary;
  };
  const state = records.map(withoutPayload), queue = actions.map(withoutPayload);
  const budget = {partial_context: true, record_payloads_omitted: true,
    omitted_state_records: 0, omitted_actions: 0,
    note: 'Full records remain saved. Omitted payloads or records are not evidence of completed work.'};
  const compact = {...context, durable_company_state: state, durable_action_queue: queue, context_budget: budget};
  let serialized = JSON.stringify(compact);
  while (serialized.length > limit && (queue.length || state.length)) {
    if (queue.length) {queue.pop(); budget.omitted_actions++;}
    else {state.pop(); budget.omitted_state_records++;}
    serialized = JSON.stringify(compact);
  }
  if (serialized.length > limit) throw new Error('COMPANY_CONTEXT_TOO_LARGE');
  return serialized;
}
