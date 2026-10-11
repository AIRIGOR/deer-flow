import {createHash, randomUUID} from 'node:crypto';
import {founderJson, type founderStore} from './founder.js';
type Store = Awaited<ReturnType<typeof founderStore>>;

// Editing and dispatch share a per-action lock. A crashed operation stays blocked
// for investigation rather than risking an edit racing an uncertain mail send.
export async function emailOperation(store: Store, actionKey: string, operation: () => Promise<Response>) {
  const key = 'founder/email-operation-locks/' + createHash('sha256').update(actionKey).digest('hex');
  const existing = await store.getWithMetadata(key, {type: 'json'});
  if (existing?.data?.status === 'ACTIVE') return founderJson({detail: 'This draft is being edited or sent. Refresh to read its saved status.'}, 409);
  const owner = randomUUID();
  const claimed = await store.setJSON(key, {status: 'ACTIVE', owner, created_at: new Date().toISOString()}, existing?.etag ? {onlyIfMatch: existing.etag} : {onlyIfNew: true});
  if (!claimed.modified) return founderJson({detail: 'Another draft operation started. Refresh before continuing.'}, 409);
  try {return await operation();}
  finally {
    const current = await store.getWithMetadata(key, {type: 'json'});
    if (current?.etag && current.data?.owner === owner) await store.setJSON(key, {...current.data, status: 'RELEASED'}, {onlyIfMatch: current.etag});
  }
}
