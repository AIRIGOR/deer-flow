import {createHash} from 'node:crypto';
import {getDeployStore, getStore} from '@netlify/blobs';
import type {Context} from '@netlify/functions';

const legacyPreviewDeploy = '6abdd62c3009490008c3f5de';
export function companyStoreName(context: Context) {
  if (context.deploy.context === 'production') return 'rigor-company';
  const preview = context.url?.hostname.match(/^deploy-preview-(\d+)--[a-z0-9-]+\.netlify\.app$/);
  if (context.deploy.context === 'deploy-preview' && preview) return `rigor-company-preview-${preview[1]}`;
  const branch = (context.deploy as Context['deploy'] & {branch?: string}).branch;
  if (!branch) return null;
  const scope = createHash('sha256').update(`${context.deploy.context}:${branch}`).digest('hex').slice(0, 24);
  return `rigor-company-preview-${scope}`;
}

export async function companyStore(context: Context) {
  const name = companyStoreName(context);
  if (!name) return getDeployStore('rigor-company');
  const store = getStore({name, consistency: 'strong'});
  // Recover this project's existing PR 11 history once, without touching production.
  // Conditional writes cannot overwrite newer data if two requests migrate together.
  if (context.deploy.context !== 'deploy-preview' || name !== 'rigor-company-preview-11') return store;
  const marker = 'migration/preview-history-v1';
  if (await store.get(marker, {type: 'json'})) return store;
  const previous = getDeployStore({name: 'rigor-company', deployID: legacyPreviewDeploy, consistency: 'strong'});
  const keys = ['pulse/latest', 'pulse/last-attempt', 'state/records', 'actions/queue'];
  const commands = await previous.list({prefix: 'founder/commands/'});
  keys.push(...commands.blobs.map(row => row.key));
  for (const prefix of ['actions/results/', 'pulse/history/']) {
    const listed = await previous.list({prefix});
    keys.push(...listed.blobs.map(row => row.key));
  }
  for (const key of new Set(keys)) {
    let value = await previous.get(key, {type: 'json'});
    if (value === null) continue;
    if (key === 'actions/queue' && Array.isArray(value)) value = value.map(row =>
      ['APPROVED', 'EXECUTING'].includes(row.status) ? {...row, status: 'NEEDS_APPROVAL', approval_required: true, policy_reason: 'Recovered from an earlier preview; review before resuming execution.'} : row);
    if (key.startsWith('founder/commands/') && ['QUEUED', 'RUNNING'].includes(value.status)) value = {...value, status: 'FAILED', failure_code: 'PREVIEW_REDEPLOYED', completed_at: new Date().toISOString()};
    await store.setJSON(key, value, {onlyIfNew: true});
  }
  await store.setJSON(marker, {source_deploy: legacyPreviewDeploy, recovered_at: new Date().toISOString()}, {onlyIfNew: true});
  return store;
}
