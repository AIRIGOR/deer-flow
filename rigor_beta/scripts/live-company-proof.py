"""Require two fresh company cycles and one bounded command with durable receipts."""
import argparse
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--output', default='.artifacts/live-company-proof')
args = parser.parse_args()
token = os.environ.get('RIGOR_AUTOMATION_TOKEN', '').strip()
if not token:
    raise SystemExit('Set RIGOR_AUTOMATION_TOKEN using the protected service credential; never commit it.')
base = args.url.rstrip('/')
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)


def request(path, body=None, key=None):
    headers = {'X-RIGOR-Automation-Token': token, 'Content-Type': 'application/json'}
    if key:
        headers['Idempotency-Key'] = key
    req = urllib.request.Request(base + path, headers=headers, data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Company proof request failed: HTTP {error.code} on {path}') from None


def run_command(kind, objective):
    command_id = str(uuid.uuid4())
    started = time.time()
    result = request('/api/founder/commands', {'kind': kind, 'objective': objective}, command_id)
    assert result.get('command_id') == command_id, 'Wrong command accepted'
    deadline = time.monotonic() + 16 * 60
    while time.monotonic() < deadline:
        result = request('/api/founder/commands/' + command_id)
        if result.get('status') in {'FAILED', 'TIMED_OUT'}:
            raise RuntimeError(f"{kind} failed: {result.get('failure_code') or result['status']}")
        if result.get('status') == 'COMPLETE':
            receipt = result.get('execution_receipt') or {}
            assert receipt.get('command_id') == command_id and receipt.get('delegation_verified') is True, 'Missing durable receipt'
            assert receipt.get('external_action_performed') is False, 'Internal command boundary missing'
            receipts = receipt.get('execution_receipts') or []
            assert all(item.get('status') == 'COMPLETE' and item.get('task_id') for item in receipts), 'Invalid task receipt'
            assert len({item['task_id'] for item in receipts}) == len(receipts), 'Duplicate task receipts'
            if kind == 'RUN_COMPANY_PULSE':
                assert len(receipts) == 6 and len({item['agent'] for item in receipts}) == 6, 'Six distinct delegates required'
                assert sum(item['agent'] == 'rigor-chief-of-staff' for item in receipts) == 1, 'Chief synthesis missing'
                assert result['result'].get('durable_state_records', 0) > 0, 'No durable state'
            else:
                assert len(receipts) == 1 and receipts[0]['agent'] == result['owner_agent'], 'Assigned specialist missing'
            (output / f'{kind}-{command_id}.json').write_text(json.dumps(result, indent=2))
            print(f'{kind} COMPLETE ({int(time.time() - started)}s): {command_id}', flush=True)
            return result
        time.sleep(5)
    raise RuntimeError(f'{kind} did not complete within 16 minutes; acceptance does not pass this gate')


first = run_command('RUN_COMPANY_PULSE', 'Prove product and AI-company reliability using current deployment evidence. Preserve founder authority and durable company state.')
second = run_command('RUN_COMPANY_PULSE', 'Run the next company cycle. Review and build on the prior durable state; verify product reliability and safe internal execution. E3 remains medium priority.')
assert first['result']['generated_at'] != second['result']['generated_at'], 'Cycles must have distinct completion evidence'
command = run_command('MOAT_REVIEW', 'Review the production handshake and change-impact moat from current evidence. Produce an internal report identifying proven behavior and release blockers.')
state = request('/api/founder')
assert state.get('records'), 'Durable company records did not survive reload'
completed = {item['command_id'] for item in state.get('commands', []) if item.get('status') == 'COMPLETE'}
assert {first['command_id'], second['command_id'], command['command_id']} <= completed, 'Command receipts did not survive reload'
(output / 'proof.json').write_text(json.dumps({'result': 'PASS', 'url': base, 'command_ids': [first['command_id'], second['command_id'], command['command_id']], 'durable_records': len(state['records'])}, indent=2))
print('PASS: two fresh cycles, assigned specialist execution and persisted founder reports', flush=True)
