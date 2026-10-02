type Data = Record<string, unknown>;
export const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
export const text = (value: unknown): string => typeof value === 'string' ? value : '';
export const items = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const names: Record<string, string> = {
  RUN_COMPANY_PULSE: 'Company cycle', RELEASE_REVIEW: 'Release review', MOAT_REVIEW: 'Product moat review', COMPANY_REVIEW: 'Company review', PREPARE_OUTREACH: 'Outreach preparation',
  'rigor-product-ops': 'Product operations', 'rigor-engineering': 'Engineering', 'rigor-qa-security': 'QA and security',
  'rigor-market-intel': 'Market intelligence', 'rigor-partnerships-capital': 'Partnerships and capital', 'rigor-chief-of-staff': 'Chief of Staff',
};
export const label = (value: unknown) => names[text(value)] || text(value).replace(/^rigor-/, '').replace(/[_-]/g, ' ').toLowerCase();
export function report(commandValue: unknown) {
  const command = object(commandValue), result = object(command.result), receipt = object(command.execution_receipt);
  const status = text(command.status);
  const statuses: Record<string, string> = {COMPLETE: 'Review completed', QUEUED: 'Waiting to start', RUNNING: 'Review in progress', FAILED: 'Review failed', TIMED_OUT: 'Review timed out'};
  if (command.kind === 'PREPARE_OUTREACH') Object.assign(statuses, {COMPLETE: 'Draft package prepared', RUNNING: 'Preparing outreach', FAILED: 'Preparation incomplete'});
  const start = Date.parse(text(command.started_at)), end = Date.parse(text(command.completed_at));
  return {
    title: label(command.kind), status: statuses[status] || 'Status unavailable', rawStatus: status,
    summary: text(result.result_summary) || text(result.current_state),
    duration: Number.isFinite(start) && Number.isFinite(end) && end >= start ? `${Math.round((end - start) / 1000)} seconds` : '',
    verified: status === 'COMPLETE' && receipt.command_id === command.command_id && receipt.delegation_verified === true,
    delegates: items(receipt.execution_receipts).map(object).map(row => ({name: label(row.agent), status: row.status === 'COMPLETE' ? 'Completed' : label(row.status)})),
    result,
  };
}
function node(tag: string, content: string, className?: string) {
  const element = document.createElement(tag); element.textContent = content;
  if (className) element.className = className;
  return element;
}
function evidence(parent: HTMLElement, value: unknown) {
  const details = document.createElement('details'); details.className = 'technical-evidence';
  details.append(node('summary', 'View technical evidence'), node('pre', JSON.stringify(value, null, 2)));
  parent.append(details);
}
function section(parent: HTMLElement, title: string, value: unknown) {
  const entries = items(value).filter(item => typeof item === 'string' && item.trim());
  if (!entries.length) return;
  parent.append(node('h4', title));
  const list = document.createElement('ul'); entries.forEach(item => list.append(node('li', text(item)))); parent.append(list);
}
function assessment(parent: HTMLElement, result: Data) {
  const packet = object(result.outreach_package);
  if (packet.version === 'RIGOR_OUTREACH_V1') {renderOutreach(parent, packet); return;}
  parent.append(node('p', 'Company assessment · Findings and proposed actions require supporting evidence. A completed review does not mean the product is cleared for release.', 'assessment-note'));
  section(parent, 'Priorities', result.top_priorities);
  section(parent, 'Reported risks to verify', result.blockers_risks);
  section(parent, 'Decisions requested', result.founder_approvals);
  section(parent, 'Proposed next actions', result.next_actions);
  const markdown = text(result.artifact_markdown);
  if (markdown) {
    const content = document.createElement('div'); content.className = 'written-report';
    // Treat generated content as text; never execute HTML or model-supplied links.
    for (const block of markdown.split(/\n\s*\n/).filter(Boolean)) {
      const heading = block.match(/^#{1,6}\s+([^\n]+)$/);
      content.append(node(heading ? 'h4' : 'p', heading ? heading[1] : block));
    }
    parent.append(content);
  }
}
function renderOutreach(parent: HTMLElement, packet: Data) {
  parent.append(node('p', 'Ten prospects · Ten introductory drafts · Ten follow-ups · UNSENT. Source claims require verification; preparation does not approve sending.', 'assessment-note'));
  section(parent, 'Three proposed first approaches', packet.top_three);
  section(parent, 'Missing evidence', packet.missing_evidence);
  const table = document.createElement('table'); table.className = 'prospect-table';
  const head = document.createElement('tr');
  ['Organization', 'Category', 'Geography', 'Priority'].forEach(title => head.append(node('th', title)));
  table.append(head);
  for (const value of items(packet.prospects)) {
    const p = object(value), row = document.createElement('tr');
    [text(p.organization), label(p.category), text(p.geography), label(p.priority)].forEach(cell => row.append(node('td', cell)));
    table.append(row);
  }
  const wrap = document.createElement('div'); wrap.className = 'prospect-table-wrap'; wrap.append(table); parent.append(wrap);
  for (const value of items(packet.prospects)) {
    const p = object(value), draft = document.createElement('details'); draft.className = 'written-report';
    draft.append(node('summary', `${text(p.organization)} · ${label(p.category)} · ${label(p.priority)}`));
    draft.append(node('p', `Geography: ${text(p.geography)}`));
    draft.append(node('p', `Decision-maker: ${text(p.decision_maker) || 'Unknown'} · ${text(p.decision_maker_role) || 'Role unverified'}`));
    draft.append(node('p', `Public contact route: ${text(p.contact_route)}`));
    draft.append(node('h4', 'Fit and operational problem'), node('p', text(p.fit)), node('p', text(p.operational_problem)));
    section(draft, 'Sources and reported support', items(p.sources).map(object).map(s => `${text(s.supports)} — ${text(s.url)}`));
    section(draft, 'Verification gaps', p.verification_gaps);
    draft.append(node('h4', `Subject: ${text(p.subject)}`), node('p', text(p.introduction)), node('h4', 'Follow-up draft'), node('p', text(p.follow_up)));
    parent.append(draft);
  }
}
export function renderCommands(parent: HTMLElement, values: unknown) {
  parent.replaceChildren();
  for (const value of items(values)) {
    const command = object(value), view = report(command), article = document.createElement('article'); article.className = 'command-report';
    const heading = document.createElement('div'); heading.className = 'report-heading';
    heading.append(node('h3', view.title), node('span', view.status, `report-status ${view.rawStatus === 'COMPLETE' ? 'complete' : ''}`)); article.append(heading);
    const timestamp = text(command.completed_at) || text(command.created_at);
    const date = Date.parse(timestamp);
    if (Number.isFinite(date)) article.append(node('p', `${new Date(date).toLocaleString()}${view.duration ? ` · ${view.duration}` : ''}`, 'report-meta'));
    article.append(node('p', text(command.objective), 'report-objective'));
    if (view.summary) article.append(node('p', view.summary));
    if (view.verified) article.append(node('p', 'Execution and specialist delegation verified by the server.', 'verified-proof'));
    if (view.delegates.length) {
      const list = document.createElement('ul'); list.className = 'delegate-list';
      view.delegates.forEach(row => list.append(node('li', `${row.name} · ${row.status}`))); article.append(list);
    }
    if (['FAILED', 'TIMED_OUT'].includes(view.rawStatus)) article.append(node('p', command.failure_code === 'OUTREACH_DELIVERABLES_MISSING'
      ? 'Outreach preparation is incomplete: the specialist did not return the required ten prospects and complete drafts. Any partial output below is not an approved outreach package.'
      : 'This review did not complete. Check the technical evidence for its failure code.', 'assessment-note'));
    if (Object.keys(view.result).length) assessment(article, view.result);
    evidence(article, command); parent.append(article);
  }
  if (!parent.childNodes.length) parent.append(node('p', 'No commands yet. Run an internal review to create your first report.'));
}
export function renderPulse(parent: HTMLElement, value: unknown) {
  parent.replaceChildren();
  if (!value) { parent.append(node('p', 'No completed company cycle yet.')); return; }
  const result = object(object(value).pulse);
  if (text(result.current_state)) parent.append(node('p', text(result.current_state)));
  assessment(parent, result); evidence(parent, value);
}
export function renderState(parent: HTMLElement, recordsValue: unknown, actionsValue: unknown) {
  parent.replaceChildren(); const records = items(recordsValue), actions = items(actionsValue);
  parent.append(node('p', `${records.length} saved company records · ${actions.length} tracked actions`, 'report-meta'));
  for (const [heading, entries] of [['Saved records', records], ['Action queue', actions]] as const) {
    if (!entries.length) continue;
    parent.append(node('h3', heading));
    for (const value of entries) {
      const row = object(value), article = document.createElement('article'); article.className = 'state-record';
      article.append(node('h4', text(row.title)), node('p', [label(row.status), label(row.priority), label(row.owner_agent)].filter(Boolean).join(' · '), 'report-meta'));
      if (text(row.summary)) article.append(node('p', text(row.summary)));
      if (row.approval_required === true) article.append(node('p', 'Founder approval required', 'assessment-note'));
      parent.append(article);
    }
  }
  parent.append(node('p', 'Saved assessments and proposals are company records; their claims still need verification.', 'assessment-note'));
  evidence(parent, {records: recordsValue, actions: actionsValue});
}
