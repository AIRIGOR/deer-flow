import {object, report} from './founder-report.js';
export function commandNotice(value: unknown) {
  const command = object(value), view = report(command);
  if (view.rawStatus === 'COMPLETE') return `${view.title}: ${view.status}. ${view.verified ? 'Results saved; specialist execution verified. Read the report below.' : 'Execution verification is unavailable. Check the technical evidence.'}`;
  if (['FAILED', 'TIMED_OUT'].includes(view.rawStatus)) return `${view.title}: ${view.status}. Read the report below for the failure details.`;
  return `${view.title}: ${view.status}. ${command.launch_status === 'UNCONFIRMED' ? 'Start could not be confirmed; checking saved status.' : 'Checking for the saved execution result.'}`;
}

export function createStatusPoller(load: () => Promise<boolean>, onFailure: (retrying: boolean) => void, delay = 5000) {
  let timer: ReturnType<typeof setTimeout> | undefined, generation = 0, failures = 0;
  const schedule = (active: number) => { timer = setTimeout(() => void tick(active), delay); };
  async function tick(active: number) {
    try {
      const pending = await load();
      if (active !== generation) return;
      failures = 0;
      if (pending) schedule(active);
    } catch {
      if (active !== generation) return;
      const retrying = ++failures < 3;
      onFailure(retrying);
      if (retrying) schedule(active);
    }
  }
  return {
    start() {clearTimeout(timer); failures = 0; schedule(++generation);},
    stop() {clearTimeout(timer); generation++;},
  };
}
