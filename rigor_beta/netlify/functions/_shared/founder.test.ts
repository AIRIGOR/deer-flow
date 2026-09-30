import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Context} from '@netlify/functions';
const mocks = vi.hoisted(() => {
  const records = new Map<string, any>();
  return {records, user: vi.fn(), origin: vi.fn(), pulse: vi.fn(), store: {
    get: vi.fn(async (key: string) => records.get(key) ?? null),
    getWithMetadata: vi.fn(async (key: string) => records.has(key) ? {data: records.get(key), etag: 'revision'} : null),
    setJSON: vi.fn(async (key: string, value: unknown, options?: {onlyIfNew?: boolean}) => {
      if (options?.onlyIfNew && records.has(key)) return {modified: false};
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
    expect(mocks.records.get('founder/commands/' + id).status).toBe('QUEUED');
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
