import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Context} from '@netlify/functions';
const mocks = vi.hoisted(() => {
  const saved = new Map<string, unknown>(), legacy = new Map<string, unknown>();
  const store = {get: vi.fn(async (key: string) => saved.get(key) ?? null), setJSON: vi.fn(async (key: string, value: unknown) => {if (!saved.has(key)) saved.set(key,value); return {modified: true};})};
  const previous = {get: vi.fn(async (key: string) => legacy.get(key) ?? null), list: vi.fn(async ({prefix}: {prefix: string}) => ({blobs: [...legacy.keys()].filter(key => key.startsWith(prefix)).map(key => ({key}))}))};
  return {saved, legacy, store, previous, global: vi.fn(() => store), deploy: vi.fn(() => previous)};
});
vi.mock('@netlify/blobs', () => ({getStore: mocks.global, getDeployStore: mocks.deploy}));
import {companyStore, companyStoreName} from './company-store.js';
const context = (branch: string, id = 'new', scope = 'deploy-preview') => ({deploy: {branch, id, context: scope}, url: new URL(`https://deploy-preview-${branch === 'fix/rigor-pod-live-proof-20260930' ? '11' : branch === 'work' ? '12' : '13'}--rigor-flow-preview.netlify.app`)} as unknown as Context);
beforeEach(() => {vi.clearAllMocks(); mocks.saved.clear(); mocks.legacy.clear();});
describe('company persistence across preview redeploys', () => {
  it('keeps a stable preview scope while separating production and other branches', () => {
    expect(companyStoreName(context('work','one'))).toBe(companyStoreName(context('work','two')));
    expect(companyStoreName(context('work'))).not.toBe(companyStoreName(context('other')));
    expect(companyStoreName(context('work','one','production'))).toBe('rigor-company');
  });
  it('recovers completed Founder history once without overwriting newer records or resuming actions', async () => {
    mocks.legacy.set('founder/commands/one', {status: 'COMPLETE', result: {saved: true}});
    mocks.legacy.set('founder/commands/two', {status: 'RUNNING'});
    mocks.legacy.set('state/records', ['old']); mocks.saved.set('state/records', ['new']);
    mocks.legacy.set('actions/queue', [{status: 'APPROVED', approval_required: false}, {status: 'COMPLETE'}]);
    const branch = 'fix/rigor-pod-live-proof-20260930';
    await companyStore(context(branch));
    expect(mocks.saved.get('founder/commands/one')).toMatchObject({status: 'COMPLETE', result: {saved: true}});
    expect(mocks.saved.get('founder/commands/two')).toMatchObject({status: 'FAILED', failure_code: 'PREVIEW_REDEPLOYED'});
    expect(mocks.saved.get('state/records')).toEqual(['new']);
    expect(mocks.saved.get('actions/queue')).toEqual([expect.objectContaining({status: 'NEEDS_APPROVAL', approval_required: true}), {status: 'COMPLETE'}]);
    const count = mocks.previous.list.mock.calls.length;
    await companyStore(context(branch,'next')); expect(mocks.previous.list).toHaveBeenCalledTimes(count);
  });
  it('never imports this preview history into production or another preview', async () => {
    await companyStore(context('other')); await companyStore(context('work','one','production'));
    expect(mocks.previous.list).not.toHaveBeenCalled();
  });
});
