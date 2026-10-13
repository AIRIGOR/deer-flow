"""Prove one internal command and persistence; emit no private company content."""
import argparse
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    base = args.url.rstrip('/')
    token = os.environ.get('RIGOR_AUTOMATION_TOKEN', '').strip()
    if not token:
        raise SystemExit('Protected execution credential is not configured.')

    def request(path, body=None, key=None, authenticated=True):
        headers = {'Content-Type': 'application/json'}
        if authenticated:
            headers['X-RIGOR-Automation-Token'] = token
        if key:
            headers['Idempotency-Key'] = key
        req = urllib.request.Request(base + path, headers=headers,
                                     data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            # Never print provider response bodies, credentials, or company state.
            return error.code, {}

    deadline = time.monotonic() + 300
    while True:
        try:
            status, meta = request('/deploy-meta.json', authenticated=False)
            if status == 200 and meta.get('commit') == args.commit:
                break
        except (ValueError, OSError):
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError('The preview did not publish the exact requested commit.')
        time.sleep(10)

    status, _ = request('/api/founder', authenticated=False)
    assert status == 401, 'Anonymous Founder access was not blocked'
    status, _ = request('/api/founder/action-reviews', {'decision': 'APPROVE'})
    assert status == 403, 'Service caller must not approve Founder actions'
    status, _ = request('/api/founder/email-send', {})
    assert status == 403, 'Service caller must not send email'

    command_id = str(uuid.uuid4())
    status, result = request('/api/founder/commands', {
        'kind': 'COMPANY_REVIEW',
        'objective': 'Perform a bounded internal execution check. Report the named specialist and saved command receipt. Do not research, send email, spend, deploy, or change company records beyond this command result.'
    }, command_id)
    assert status == 202 and result.get('command_id') == command_id, 'Internal command was not accepted'
    deadline = time.monotonic() + 16 * 60
    while time.monotonic() < deadline:
        status, result = request('/api/founder/commands/' + command_id)
        assert status == 200, f'Command status unavailable: HTTP {status}'
        state = result.get('status')
        if state in {'FAILED', 'TIMED_OUT'}:
            code = result.get('failure_code', state)
            allowed = code if isinstance(code, str) and code.replace('_', '').isalnum() and len(code) < 80 else 'EXECUTION_FAILED'
            raise RuntimeError(f'Internal command failed: {allowed}')
        if state == 'COMPLETE':
            break
        time.sleep(5)
    else:
        raise RuntimeError('Internal command did not complete; acceptance is insufficient')

    receipt = result.get('execution_receipt') or {}
    delegates = receipt.get('execution_receipts') or []
    assert receipt.get('command_id') == command_id and receipt.get('delegation_verified') is True
    assert receipt.get('external_action_performed') is False
    assert len(delegates) == 1 and delegates[0].get('status') == 'COMPLETE'
    assert delegates[0].get('task_id') and delegates[0].get('agent') == result.get('owner_agent')
    status, reloaded = request('/api/founder/commands/' + command_id)
    assert status == 200 and reloaded.get('execution_receipt') == receipt, 'Receipt did not persist'
    evidence = {'result': 'PASS', 'commit': args.commit, 'command_id': command_id,
                'delegation_verified': True, 'persisted': True, 'external_action_performed': False,
                'anonymous_access_blocked': True, 'service_approval_blocked': True, 'service_email_blocked': True}
    output = Path('.artifacts/founder-command-proof')
    output.mkdir(parents=True, exist_ok=True)
    (output / 'proof.json').write_text(json.dumps(evidence, indent=2))
    print(json.dumps(evidence), flush=True)


if __name__ == '__main__':
    main()
