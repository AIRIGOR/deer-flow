import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Context} from '@netlify/functions';
const mocks = vi.hoisted(() => {
  const records = new Map<string, any>();
  return {records, user: vi.fn(), origin: vi.fn(), pulse: vi.fn(), store: {
    get: vi.fn(async (key: string) => records.get(key) ?? null),
    getWithMetadata: vi.fn(async (key: string) => records.has(key) ? {data: records.get(key), etag: 'revision'} : null),
    setJSON: vi.fn(async (key: string, value: unknown, options?: {onlyIfNew?: boolean; onlyIfMatch?: string}) => {
      if (options?.onlyIfNew && records.has(key)) return {modified: false};
      if (options?.onlyIfMatch && options.onlyIfMatch !== 'revision') return {modified: false};
      records.set(key, value); return {modified: true};
    }),
    list: vi.fn(async (options?: {prefix?: string}) => ({blobs: [...records.keys()].filter(key => key.startsWith(options?.prefix || 'founder/commands/')).map(key => ({key}))})),
  }};
});
vi.mock('@netlify/blobs', () => ({getStore: () => mocks.store, getDeployStore: () => mocks.store}));
vi.mock('@netlify/identity', () => ({getUser: mocks.user, verifyRequestOrigin: mocks.origin}));
vi.mock('../rigor-company-pulse-background.mjs', () => ({runCompanyPulse: mocks.pulse}));
import founder from '../rigor-founder.mjs';
import worker from '../rigor-founder-command-background.mjs';
import {commandView, delegationVerified, normalizeExecutionResult} from './founder.js';
import {outreachFixture} from './outreach-fixture.js';
const context = {deploy: {context: 'production'}} as Context;
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const request = (path = '/api/founder/commands', body?: unknown, service = false) => new Request(`https://example.test${path}`, {
  method: body ? 'POST' : 'GET', headers: {'Content-Type': 'application/json', 'Idempotency-Key': id, ...(service ? {'X-RIGOR-Automation-Token': 'secret'} : {})}, ...(body ? {body: JSON.stringify(body)} : {}),
});
const command = () => ({command_id: id, status: 'QUEUED', kind: 'MOAT_REVIEW', objective: 'Review change impact with evidence.', owner_agent: 'rigor-product-ops', request_hash: 'private', issued_by: 'founder', created_at: new Date().toISOString()});
beforeEach(() => {
  vi.clearAllMocks(); mocks.records.clear(); mocks.user.mockResolvedValue({id: 'founder', roles: ['founder']}); mocks.origin.mockImplementation(() => {});
  vi.stubGlobal('Netlify', {env: {get: (key: string) => ({RIGOR_DEERFLOW_TOKEN: 'secret', RIGOR_DEERFLOW_URL: 'https://backend.test'})[key]}});
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {status: 202})));
});
describe('Founder authority and durable command execution', () => {
  it('requires explicit outreach routing rather than accepting a mismatched review', async () => {
    const rejected = await founder(request(undefined, {kind: 'RELEASE_REVIEW', objective: 'Prepare the first outreach package with prospects and drafts.'}), context);
    expect(rejected.status).toBe(422);
    expect((await rejected.json()).detail).toContain('Choose Prepare outreach');
    expect(mocks.store.setJSON).not.toHaveBeenCalled();
    const accepted = await founder(request(undefined, {kind: 'PREPARE_OUTREACH', objective: 'Prepare the first outreach package with prospects and drafts.'}), context);
    expect(accepted.status).toBe(202);
    expect(mocks.records.get('founder/commands/' + id).owner_agent).toBe('rigor-partnerships-capital');
  });
  it.each([false, true])('requires saved outreach deliverables as well as real specialist receipts: %s', complete => {
    return (async () => {
      mocks.records.set('founder/commands/' + id, {...command(), kind: 'PREPARE_OUTREACH', owner_agent: 'rigor-partnerships-capital'});
      let proposed: any;
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (!String(url).includes('/execute')) return new Response('{}');
        proposed = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({status: 'COMPLETE', result_summary: 'claimed completion',
          artifact_markdown: complete ? JSON.stringify(outreachFixture()) : 'QA readiness passed; drafts reportedly archived.',
          delegation_receipts: [{status: 'completed', call_id: 'capital-task', agent: 'rigor-partnerships-capital', result_sha256: 'a'.repeat(64)}]}));
      }));
      await worker(request(undefined, {command_id: id}, true), context);
      expect(proposed.proposal.action_type).toBe('OUTREACH_DRAFT');
      expect(proposed.proposal.payload.output_contract).toContain('RIGOR_OUTREACH_V1');
      expect(proposed.context).not.toContain('latest_company_pulse');
      const saved = mocks.records.get('founder/commands/' + id);
      expect(saved.status).toBe(complete ? 'COMPLETE' : 'FAILED');
      if (complete) expect(saved.result.outreach_package.prospects).toHaveLength(10);
      else {expect(saved.failure_code).toBe('OUTREACH_DELIVERABLES_MISSING'); expect(saved.result.artifact_markdown).toContain('QA readiness');}
    })();
  });
  it('accepts a 4,000-character objective and forwards its ending unchanged', async () => {
    const objective = 'x'.repeat(3979) + ' KEEP OUTREACH UNSENT';
    expect(objective).toHaveLength(4000);
    const accepted = await founder(request(undefined, {kind: 'COMPANY_REVIEW', objective}), context);
    expect(accepted.status).toBe(202);
    expect(mocks.records.get('founder/commands/' + id).objective).toBe(objective);
    let forwarded: any;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (!String(url).includes('/execute')) return new Response('{}');
      forwarded = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({status: 'COMPLETE', delegation_receipts: [{status: 'completed', call_id: 'actual-task', agent: 'rigor-chief-of-staff', result_sha256: 'a'.repeat(64)}]}));
    }));
    await worker(request(undefined, {command_id: id}, true), context);
    expect(forwarded.proposal.summary).toBe(objective);
    expect(forwarded.proposal.payload.objective).toBe(objective);
  });
  it('rejects oversized objectives before saving or launching work', async () => {
    const result = await founder(request(undefined, {kind: 'COMPANY_REVIEW', objective: 'x'.repeat(4001)}), context);
    expect(result.status).toBe(422);
    expect((await result.json()).detail).toContain('Your text has been kept');
    expect(mocks.store.setJSON).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('accepts multibyte objectives that fit the character limit', async () => {
    const req = request(undefined, {kind: 'COMPANY_REVIEW', objective: '界'.repeat(4000)});
    req.headers.set('content-length', String(new TextEncoder().encode(await req.clone().text()).length));
    expect((await founder(req, context)).status).toBe(202);
  });
  it('requires authenticated founder role and same origin', async () => {
    mocks.user.mockResolvedValue(null); expect((await founder(request('/api/founder'), context)).status).toBe(401);
    mocks.user.mockResolvedValue({id: 'other', roles: ['user'], user_metadata: {roles: ['founder']}}); expect((await founder(request('/api/founder'), context)).status).toBe(403);
    mocks.user.mockResolvedValue({id: 'founder', roles: ['founder']}); mocks.origin.mockImplementation(() => {throw new Error('origin');});
    expect((await founder(request(undefined, {kind: 'MOAT_REVIEW', objective: 'review evidence'}), context)).status).toBe(403);
    expect(mocks.store.setJSON).not.toHaveBeenCalled();
  });
  it('does not accept unbounded external actions', async () => {
    expect((await founder(request(undefined, {kind: 'EMAIL_SEND', objective: 'send company email'}), context)).status).toBe(422);
  });
  it('claims once and rejects a conflicting idempotency replay', async () => {
    const body = {kind: 'MOAT_REVIEW', objective: 'review evidence'};
    expect((await founder(request(undefined, body), context)).status).toBe(202);
    expect((await founder(request(undefined, body), context)).status).toBe(202);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await founder(request(undefined, {...body, objective: 'different objective'}), context)).status).toBe(409);
  });
  it('reports launch uncertainty without pretending it completed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {throw new Error('private diagnostic');}));
    const result = await founder(request(undefined, {kind: 'MOAT_REVIEW', objective: 'review evidence'}), context);
    expect(await result.json()).toMatchObject({status: 'QUEUED', launch_status: 'UNCONFIRMED'});
    expect(mocks.records.get('founder/commands/' + id)).toMatchObject({status: 'QUEUED', launch_attempts: 1});
  });
  it('retries stale queued commands when the Founder dashboard polls', async () => {
    mocks.records.set('founder/commands/' + id, {...command(), launch_attempts: 1, last_launch_at: '2020-01-01T00:00:00Z'});
    const result = await founder(request('/api/founder'), context);
    expect(result.status).toBe(200);
    expect(mocks.records.get('founder/commands/' + id)).toMatchObject({status: 'QUEUED', launch_attempts: 2});
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({pathname: '/.netlify/functions/rigor-founder-command-background'}), expect.objectContaining({method: 'POST'}));
  });
  it('fails a command instead of waiting forever after bounded launch retries', async () => {
    mocks.records.set('founder/commands/' + id, {...command(), launch_attempts: 5, last_launch_at: '2020-01-01T00:00:00Z'});
    const result = await founder(request('/api/founder'), context);
    expect(result.status).toBe(200);
    expect(mocks.records.get('founder/commands/' + id)).toMatchObject({status: 'FAILED', failure_code: 'LAUNCH_RETRY_EXHAUSTED'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not execute an unauthorized or duplicate background invocation', async () => {
    mocks.records.set('founder/commands/' + id, command());
    await worker(request(undefined, {command_id: id}), context); expect(fetch).not.toHaveBeenCalled();
    mocks.store.setJSON.mockResolvedValueOnce({modified: false});
    await worker(request(undefined, {command_id: id}, true), context); expect(fetch).not.toHaveBeenCalled();
  });
  it('marks upstream auth failure without publishing diagnostics', async () => {
    mocks.records.set('founder/commands/' + id, command());
    vi.stubGlobal('fetch', vi.fn(async url => new Response(String(url).includes('/execute') ? 'private' : '{}', {status: String(url).includes('/execute') ? 401 : 200})));
    await worker(request(undefined, {command_id: id}, true), context);
    expect(mocks.records.get('founder/commands/' + id)).toMatchObject({status: 'FAILED', failure_code: 'UPSTREAM_HTTP_401'});
  });
  it('rejects model completion without specialist runtime receipts', async () => {
    mocks.records.set('founder/commands/' + id, command());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({status: 'COMPLETE', result_summary: 'claimed completion'}))));
    await worker(request(undefined, {command_id: id}, true), context);
    expect(mocks.records.get('founder/commands/' + id)).toMatchObject({status: 'FAILED', failure_code: 'DELEGATION_NOT_VERIFIED'});
  });
  it('persists correlated specialist evidence and only executes once', async () => {
    mocks.records.set('founder/commands/' + id, command());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({status: 'COMPLETE', result_summary: 'reviewed', delegation_receipts: [{status: 'completed', call_id: 'actual-task', agent: 'rigor-product-ops', result_sha256: 'a'.repeat(64)}]}))));
    await worker(request(undefined, {command_id: id}, true), context);
    expect(mocks.records.get('founder/commands/' + id)).toMatchObject({status: 'COMPLETE', execution_receipt: {delegation_verified: true, external_action_performed: false}});
    const count = vi.mocked(fetch).mock.calls.length; await worker(request(undefined, {command_id: id}, true), context); expect(fetch).toHaveBeenCalledTimes(count);
  });
  it('passes the founder objective and uses this cycle result', async () => {
    mocks.records.set('founder/commands/' + id, {...command(), kind: 'RUN_COMPANY_PULSE'});
    mocks.pulse.mockResolvedValue(undefined);
    await worker(request(undefined, {command_id: id}, true), context);
    expect(mocks.pulse.mock.calls[0][2]).toBe(command().objective);
    expect(mocks.records.get('founder/commands/' + id)).toMatchObject({status: 'FAILED', failure_code: 'PULSE_DID_NOT_COMPLETE'});
  });
  it('preserves a sanitized cycle failure in the command receipt', async () => {
    mocks.records.set('founder/commands/' + id, {...command(), kind: 'RUN_COMPANY_PULSE'});
    mocks.pulse.mockRejectedValueOnce(new Error('UPSTREAM_HTTP_502'));
    await worker(request(undefined, {command_id: id}, true), context);
    expect(mocks.records.get('founder/commands/' + id)).toMatchObject({status: 'FAILED', failure_code: 'UPSTREAM_HTTP_502'});
  });
  it('redacts request hashes and shows expired running work', () => {
    expect(commandView({...command(), status: 'RUNNING', started_at: '2020-01-01T00:00:00Z'} as any)).toMatchObject({status: 'TIMED_OUT', request_hash: undefined});
    expect(delegationVerified({execution_receipts: [{status: 'COMPLETE', task_id: 'task', agent: 'wrong'}]}, 'rigor-product-ops')).toBe(false);
    expect(delegationVerified({execution_receipts: [{status: 'COMPLETE', task_id: 'task', agent: 'rigor-chief-of-staff'}]}, undefined, true)).toBe(false);
  });
});

describe('deployed runtime receipt compatibility', () => {
  it('accepts completed correlated legacy receipts with a result digest', () => {
    const result = normalizeExecutionResult({delegation_receipts: [{call_id: 'runtime-call', agent: 'rigor-product-ops', status: 'completed', result_sha256: 'a'.repeat(64)}]});
    expect(delegationVerified(result, 'rigor-product-ops')).toBe(true);
    expect(result.execution_receipts).toEqual([{task_id: 'runtime-call', agent: 'rigor-product-ops', status: 'COMPLETE', result_sha256: 'a'.repeat(64)}]);
  });
  it('rejects missing runtime digests and incomplete legacy delegations', () => {
    for (const receipt of [ {call_id: 'call', agent: 'rigor-product-ops', status: 'completed'}, {call_id: 'call', agent: 'rigor-product-ops', status: 'failed', result_sha256: 'a'.repeat(64)}]) {
      expect(delegationVerified(normalizeExecutionResult({delegation_receipts: [receipt]}), 'rigor-product-ops')).toBe(false);
    }
  });
});


describe('Founder proposal decisions', () => {
  const action = () => ({action_key: 'EMAIL_SEND:outreach', action_type: 'EMAIL_SEND', scope: 'EXTERNAL', title: 'Synthetic test draft', summary: 'A test proposal; do not send.', owner_agent: 'rigor-partnerships-capital', status: 'NEEDS_APPROVAL', approval_required: true, payload: {from: 'sender@example.test', to: 'recipient@example.test', subject: 'Synthetic', body: 'Test only'}});
  async function packet() {
    const state = await (await founder(request('/api/founder'), context)).json(); return state.actions[0];
  }
  const decide = (row: any, decision = 'APPROVE', note = '') => founder(request('/api/founder/action-reviews', {action_key: row.action_key, fingerprint: row.review_fingerprint, decision, note}), context);
  beforeEach(() => {mocks.records.set('actions/queue', [action()]);});
  it('persists exact proposal and Founder identity without launching execution; replays safely', async () => {
    const row = await packet();
    const result = await decide(row); expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({decision: 'APPROVE', decided_by: 'founder', proposal: {payload: action().payload}, execution_status: 'NOT_EXECUTED', external_action_performed: false});
    expect((await decide(row)).status).toBe(200);
    expect((await decide(row, 'REJECT')).status).toBe(409);
    expect((await packet()).review.decision).toBe('APPROVE');
    expect(mocks.records.get('actions/queue')[0].status).toBe('NEEDS_APPROVAL');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('invalidates stale approval when message or scope changes', async () => {
    const row = await packet(); await decide(row);
    mocks.records.set('actions/queue', [{...action(), payload: {...action().payload, to: 'different@example.test'}}]);
    expect((await decide(row)).status).toBe(409);
    expect((await packet()).review).toBeNull();
  });
  it('requires concrete email details before approving but permits rejection or requested changes', async () => {
    mocks.records.set('actions/queue', [{...action(), payload: {objective: 'Send outreach'}}]);
    const row = await packet(); expect((await decide(row)).status).toBe(422);
    expect((await decide(row, 'REQUEST_CHANGES')).status).toBe(422);
    expect((await decide(row, 'REQUEST_CHANGES', 'Supply the exact recipient and email.')).status).toBe(201);
    expect((await packet()).review.note).toContain('exact recipient');
  });
  it('requires a real signed-in Founder and verifies origin for every decision', async () => {
    const row = await packet();
    expect((await founder(request('/api/founder/action-reviews', {action_key: row.action_key, fingerprint: row.review_fingerprint, decision: 'APPROVE'}, true), context)).status).toBe(403);
    mocks.origin.mockImplementation(() => {throw new Error('origin');}); expect((await decide(row)).status).toBe(403);
    mocks.origin.mockImplementation(() => {}); mocks.user.mockResolvedValue({id: 'member', roles: ['member']}); expect((await decide(row)).status).toBe(403);
  });
  it('uses conditional writes to reject competing decisions and blocks executing actions', async () => {
    const row = await packet();
    mocks.store.setJSON.mockResolvedValueOnce({modified: false}); expect((await decide(row)).status).toBe(409);
    mocks.records.set('actions/queue', [{...action(), status: 'EXECUTING'}]); expect((await decide(row)).status).toBe(409);
  });
  it('rejects malformed decision bodies and missing actions', async () => {
    expect((await founder(request('/api/founder/action-reviews', []), context)).status).toBe(400);
    expect((await decide(await packet(), 'SEND')).status).toBe(422);
    mocks.records.set('actions/queue', []); expect((await decide({action_key: 'missing', review_fingerprint: 'x'})).status).toBe(404);
  });
});


describe('Saved outreach review proposals', () => {
  const saved = () => ({...command(), kind: 'PREPARE_OUTREACH', status: 'COMPLETE', result: {outreach_package: outreachFixture()}, execution_receipt: {command_id: id, delegation_verified: true}});
  it('prepares exactly three durable unsent drafts without inventing recipients; repeated requests preserve decisions', async () => {
    mocks.records.set('founder/commands/' + id, saved());
    const prepare = () => founder(request('/api/founder/outreach-proposals', {command_id: id}), context);
    expect((await prepare()).status).toBe(201);
    expect((await prepare()).status).toBe(201);
    const state = await (await founder(request('/api/founder'), context)).json();
    expect(state.actions).toHaveLength(3);
    expect(state.actions.every((a: any) => a.payload.to === null && a.payload.sending_status === 'UNSENT')).toBe(true);
    expect(state.actions[0].payload.body).toBeTruthy();
    const a = state.actions[0];
    expect((await founder(request('/api/founder/action-reviews', {action_key: a.action_key, fingerprint: a.review_fingerprint, decision: 'APPROVE'}), context)).status).toBe(422);
    expect((await founder(request('/api/founder/action-reviews', {action_key: a.action_key, fingerprint: a.review_fingerprint, decision: 'REQUEST_CHANGES', note: 'Verify the exact email recipient first.'}), context)).status).toBe(201);
    await prepare();
    const reloaded = await (await founder(request('/api/founder'), context)).json();
    expect(reloaded.actions[0].review.decision).toBe('REQUEST_CHANGES');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requires real Founder authority and verified completed package', async () => {
    mocks.records.set('founder/commands/' + id, {...saved(), status: 'FAILED'});
    expect((await founder(request('/api/founder/outreach-proposals', {command_id: id}), context)).status).toBe(409);
    expect((await founder(request('/api/founder/outreach-proposals', {command_id: id}, true), context)).status).toBe(403);
    expect([...mocks.records.keys()].some(k => k.startsWith('founder/outreach-proposals/'))).toBe(false);
  });
  it('reports sender configuration separately from delivery and never exposes credential values', async () => {
    vi.stubGlobal('Netlify', {env: {get: (key: string) => ({RIGOR_CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), RIGOR_CLOUDFLARE_EMAIL_TOKEN: 'private-mail-token'})[key]}});
    const response = await founder(request('/api/founder'), context); const raw = await response.text();
    expect(JSON.parse(raw).sender).toMatchObject({configured: true, sending_enabled: false, delivery_verified: false});
    expect(raw).not.toContain('private-mail-token'); expect(raw).not.toContain('a'.repeat(32));
  });
});

describe('Cloudflare fixed Founder delivery test', () => {
  const testRequest = () => new Request('https://example.test/api/founder/sender-test', {method: 'POST'});
  beforeEach(() => {vi.stubGlobal('Netlify', {env: {get: (key: string) => ({RIGOR_CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), RIGOR_CLOUDFLARE_EMAIL_TOKEN: 'private-mail-token', RIGOR_DEERFLOW_TOKEN: 'secret'})[key]}});});
  it('sends only the fixed self-test, persists real provider status and blocks duplicates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({success: true, result: {delivered: ['ausar_bey@icloud.com']}}))));
    const response = await founder(testRequest(), context); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({status: 'PROVIDER_DELIVERED', prospect_messages_sent: 0});
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/' + 'b'.repeat(32) + '/email/sending/send');
    expect(JSON.parse(String(init?.body))).toMatchObject({from: 'ausar@akhasha.com', to: 'ausar_bey@icloud.com', subject: 'RIGOR sender connection test'});
    expect((await founder(testRequest(), context)).status).toBe(409); expect(fetch).toHaveBeenCalledTimes(1);
    const state = await (await founder(request('/api/founder'), context)).json(); expect(state.sender.delivery_verified).toBe(true); expect(state.sender.sending_enabled).toBe(false);
  });
  it.each(['QUEUED', 'DELIVERY_UNKNOWN', 'PROVIDER_REJECTED', 'BOUNCED'])('distinguishes %s from successful delivery and never retries', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (status === 'DELIVERY_UNKNOWN') throw new Error('private upstream data');
      if (status === 'PROVIDER_REJECTED') return new Response('private error', {status: 403});
      return new Response(JSON.stringify({success: true, result: status === 'QUEUED' ? {queued: ['ausar_bey@icloud.com']} : {permanent_bounces: ['ausar_bey@icloud.com']}}));
    }));
    const result = await founder(testRequest(), context); const data = await result.json(); expect(data.status).toBe(status);
    expect(JSON.stringify(data)).not.toContain('private');
    expect((await founder(testRequest(), context)).status).toBe(409); expect(fetch).toHaveBeenCalledTimes(1);
    expect((await (await founder(request('/api/founder'), context)).json()).sender.delivery_verified).toBe(false);
  });
  it('blocks custom recipients, service callers, invalid credentials and competing reservations before sending', async () => {
    expect((await founder(request('/api/founder/sender-test', {to: 'prospect@example.test'}), context)).status).toBe(422);
    expect((await founder(request('/api/founder/sender-test', {}, true), context)).status).toBe(403);
    mocks.store.setJSON.mockResolvedValueOnce({modified: false}); expect((await founder(testRequest(), context)).status).toBe(409);
    vi.stubGlobal('Netlify', {env: {get: () => undefined}}); expect((await founder(testRequest(), context)).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
