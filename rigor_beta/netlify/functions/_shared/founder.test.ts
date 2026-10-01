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
    list: vi.fn(async () => ({blobs: [...records.keys()].filter(key => key.startsWith('founder/commands/')).map(key => ({key}))})),
  }};
});
vi.mock('@netlify/blobs', () => ({getStore: () => mocks.store, getDeployStore: () => mocks.store}));
vi.mock('@netlify/identity', () => ({getUser: mocks.user, verifyRequestOrigin: mocks.origin}));
vi.mock('../rigor-company-pulse-background.mjs', () => ({runCompanyPulse: mocks.pulse}));
import founder from '../rigor-founder.mjs';
import worker from '../rigor-founder-command-background.mjs';
import {commandView, delegationVerified, normalizeExecutionResult} from './founder.js';
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
