import {afterEach, describe, expect, it, vi} from 'vitest';
import {commandNotice, createStatusPoller} from './founder-progress.js';
afterEach(() => vi.useRealTimers());
describe('Founder command status and polling recovery', () => {
  it('replaces waiting with server-verified completion instead of leaving a stale banner', () => {
    const command = {command_id: 'one', kind: 'RUN_COMPANY_PULSE', status: 'QUEUED'};
    expect(commandNotice(command)).toContain('Waiting to start');
    expect(commandNotice({...command, status: 'RUNNING'})).toContain('Review in progress');
    const notice = commandNotice({...command, status: 'COMPLETE', execution_receipt: {command_id: 'one', delegation_verified: true}});
    expect(notice).toContain('Results saved; specialist execution verified');
    expect(notice).not.toContain('Waiting to start');
    expect(commandNotice({...command, status: 'COMPLETE'})).toContain('verification is unavailable');
  });
  it('continues after a transport interruption and stops after terminal status', async () => {
    vi.useFakeTimers(); const load = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const failed = vi.fn(); const poller = createStatusPoller(load, failed); poller.start();
    await vi.advanceTimersByTimeAsync(15000);
    expect(load).toHaveBeenCalledTimes(3); expect(failed).toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(10000); expect(load).toHaveBeenCalledTimes(3);
  });
  it('bounds failed status reads without reporting that the command failed', async () => {
    vi.useFakeTimers(); const load = vi.fn().mockRejectedValue(new Error('network')); const failed = vi.fn();
    createStatusPoller(load, failed).start(); await vi.advanceTimersByTimeAsync(30000);
    expect(load).toHaveBeenCalledTimes(3); expect(failed).toHaveBeenLastCalledWith(false);
  });
  it('does not schedule another read after sign-out during an in-flight poll', async () => {
    vi.useFakeTimers(); let resolve!: (value: boolean) => void;
    const load = vi.fn(() => new Promise<boolean>(done => {resolve = done;}));
    const poller = createStatusPoller(load, vi.fn()); poller.start(); await vi.advanceTimersByTimeAsync(5000);
    poller.stop(); resolve(true); await vi.advanceTimersByTimeAsync(10000); expect(load).toHaveBeenCalledTimes(1);
  });
});
