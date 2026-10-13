import type {Config, Context} from '@netlify/functions';
import {founderStore} from './_shared/founder.js';
import {recoverQueuedCommands} from './rigor-founder.mjs';

// Scheduled functions run only on the published deployment. Recovery launches
// saved bounded internal commands; it never consumes an approval or sends email.
export default async (request: Request, context: Context) => {
  const store = await founderStore(context);
  const listed = await store.list({prefix: 'founder/commands/'});
  await recoverQueuedCommands(store, request, listed.blobs.map(item => item.key));
};

export const config: Config = {schedule: '0 * * * *'};
