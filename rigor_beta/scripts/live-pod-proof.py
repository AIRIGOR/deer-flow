"""Exercise live source review, eight contradictions and change impact in an isolated session.

Run only on an authorized target with --url and --expected-commit.
Outputs are local evidence. Never writes to another tester's workspace.
"""
import argparse
import http.cookiejar
import json
import math
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--expected-commit', required=True, help='Exact deployed source commit; checked before any mutation.')
parser.add_argument('--analysis-timeout', type=float, default=960, help='Maximum seconds per saved-document analysis.')
parser.add_argument('--poll-interval', type=float, default=2, help='Seconds between read-only workspace polls.')
parser.add_argument('--output', default='.artifacts/live-pod-proof')
parser.add_argument('--allow-fallback', action='store_true', help='Test product gates even if the DeerFlow bridge fails; bridge remains an explicit failed gate.')
parser.add_argument('--compatible-labor-wording', action='store_true', help='Isolate the known provides-verb defect on b7c9fee; this is not proof that defect is fixed.')
args = parser.parse_args()
if not re.fullmatch(r'[0-9a-f]{40}', args.expected_commit):
    parser.error('Expected commit must be a full lowercase 40-character Git SHA.')
if any(not math.isfinite(value) or value <= 0 for value in (args.analysis_timeout, args.poll_interval)):
    parser.error('Analysis timeout and poll interval must be finite positive seconds.')
base = args.url.rstrip('/')
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
evidence = {'url': base, 'expected_commit': args.expected_commit, 'result': 'FAIL', 'stages': []}
(out / 'proof.json').write_text(json.dumps(evidence, indent=2))

def request(path, data=None, method='GET', expected=200, headers=None, raw=False, timeout=120):
    if isinstance(data, dict):
        data = json.dumps(data).encode()
        headers = {'Content-Type': 'application/json', **(headers or {})}
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers or {})
    try:
        response = opener.open(req, timeout=timeout)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read()
        if response.status != expected:
            raise RuntimeError(f'Proof request failed: HTTP {response.status} on {path}')
    return body if raw else json.loads(body)

def upload(name, text):
    boundary = 'rigor-pod-proof-boundary'
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
            f'Content-Type: text/plain\r\n\r\n{text}\r\n--{boundary}--\r\n').encode()
    payload = request('/api/documents', body, 'POST', expected=202, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    document_id = payload['result']['document_id']
    production_id = payload['workspace']['production']['production_id']
    if not isinstance(document_id, str) or not document_id or not production_id:
        raise RuntimeError('Upload returned no saved document identity')
    deadline = time.monotonic() + args.analysis_timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('Saved document analysis timed out; proof does not pass')
        state = request('/api/workspace', timeout=min(120, remaining))
        if state.get('production', {}).get('production_id') != production_id:
            raise RuntimeError('Active production changed during analysis; proof does not pass')
        document = next((item for item in state.get('documents', []) if item.get('document_id') == document_id), None)
        if not document or document.get('status') not in {'PROCESSING', 'PROCESSED'}:
            raise RuntimeError('Saved document analysis failed or disappeared; proof does not pass')
        if document['status'] == 'PROCESSED':
            if document.get('analysis_engine') == 'DEERFLOW':
                if not document.get('analysis_receipt_id'):
                    raise RuntimeError('Processed document has no DeerFlow execution receipt')
            elif not args.allow_fallback:
                raise RuntimeError('Document has no verified DeerFlow analysis')
            break
        time.sleep(min(args.poll_interval, max(0, deadline - time.monotonic())))
    evidence['stages'].append({'upload': name, **document})
    (out / 'proof.json').write_text(json.dumps(evidence, indent=2))
    if not args.allow_fallback:
        assert document['analysis_engine'] == 'DEERFLOW'
    print(json.dumps(evidence['stages'][-1]), flush=True)
    return state

def capture(name, state):
    (out / (name + '.json')).write_text(json.dumps(state, indent=2))
    evidence['stages'].append({'stage': name, 'readiness': state['readiness']})
    print(name, state['readiness']['status'], flush=True)

def reports(prefix):
    for department in ['Master', 'Rigging', 'Video', 'Stage Management', 'Audio']:
        query = '' if department == 'Master' else '?department=' + urllib.parse.quote(department)
        pdf = request('/api/reports/advance.pdf' + query, raw=True)
        assert pdf.startswith(b'%PDF-'), department
        (out / f'{prefix}-{department.replace(" ", "-")}.pdf').write_bytes(pdf)

evidence['deployment'] = request('/deploy-meta.json')
(out / 'proof.json').write_text(json.dumps(evidence, indent=2))
if evidence['deployment'].get('commit') != args.expected_commit:
    raise RuntimeError('Deployed source commit differs from expected commit; no mutation authorized by this proof')
request('/api/reports/advance.pdf', expected=401)
state = request('/api/start', {'display_name': 'Pod Completion Proof', 'role': 'PM'}, 'POST')
state = request('/api/productions', {'show_name': 'SYNTHETIC Eight Constraint Proof', 'artist': 'SYNTHETIC World Tour', 'venue': 'SYNTHETIC Arena', 'city': 'Test environment', 'show_date': '2026-10-24'}, 'POST', expected=201)
tour = '''Show power must provide 400A service at stage right.
Tour rigging requires minimum downstage trim of 42 ft.
The automated LED section requires a suspended weight allowance of 12000 kg.
Rigging point load requires capacity of 2000 kg per point.
Load-in dock must provide 4 simultaneous truck loading bays for 25 trucks.
Automated B-stage requires a clear footprint of 40 ft x 30 ft.
Show curfew required is 23:30.
Labor call requires 36 stagehands at 08:00.'''
venue = '''Show power can only provide 200A service at stage right.
Venue maximum downstage trim is 38 ft.
The automated LED section has a maximum suspended weight allowance of 8000 kg.
Rigging point load provides maximum capacity of 1000 kg per point.
Load-in dock can only provide 2 simultaneous truck loading bays for 25 trucks.
Automated B-stage has a maximum clear footprint of 30 ft x 20 ft available.
Show curfew available is 23:00.
Labor call provides 24 stagehands at 08:00.'''
if args.compatible_labor_wording:
    venue = venue.replace('Labor call provides', 'Labor call can only provide')
    evidence['known_defect_workaround'] = 'Venue labor wording changed from provides to can only provide. Original missed-statement regression remains a release gate.'
upload('synthetic-tour.txt', tour)
state = upload('synthetic-venue.txt', venue)
expected = {'POWER_CAPACITY', 'RIGGING_TRIM', 'RIGGING_SUSPENDED_WEIGHT', 'RIGGING_POINT_LOAD', 'DOCK_ACCESS', 'BSTAGE_FOOTPRINT', 'SHOW_CURFEW', 'LABOR_CALL'}
categories = {item['category'] for item in state['conflicts']}
assert expected <= categories, {'missing_categories': sorted(expected - categories)}
assert state['readiness']['status'] == 'BLOCKED'
capture('eight-contradictions', state)
reports('blocked')
for item in state['requirements']:
    state = request('/api/requirements/' + item['requirement_id'], {'status': 'CONFIRMED', 'owner': 'Synthetic Proof Lead'}, 'PATCH')
for item in state['conflicts']:
    state = request('/api/conflicts/' + item['conflict_id'] + '/resolve', {'resolution': 'SYNTHETIC TEST ONLY: amended production plan accepted for proof, never an actual engineering approval.', 'owner': 'Synthetic Proof Lead'}, 'POST')
for item in state['checkpoints']:
    state = request('/api/checkpoints/' + item['checkpoint_id'], {'complete': True}, 'PATCH')
assert state['readiness']['status'] == 'NEEDS_REVIEW', state['readiness']
capture('source-review-still-required', state)
for item in state['documents']:
    state = request('/api/documents/' + item['document_id'] + '/review', {'complete_source_review': True}, 'POST')
assert state['readiness']['status'] == 'SHOW_READY', state['readiness']
capture('synthetic-show-ready', state)
state = upload('synthetic-amendment.txt', 'The automated LED section has a maximum suspended weight allowance of 6000 kg.')
assert state['readiness']['status'] == 'BLOCKED', state['readiness']
for department in ['Rigging', 'Video']:
    assert any(item['department'] == department and item['status'] == 'PENDING' for item in state['checkpoints']), department
assert all(item['status'] == 'COMPLETE' for item in state['checkpoints'] if item['department'] == 'Audio')
capture('change-impact-reopened', state)
reports('amended')
persisted = request('/api/workspace')
assert persisted['readiness'] == state['readiness']
if request('/deploy-meta.json').get('commit') != args.expected_commit:
    raise RuntimeError('Deployment changed during proof; acceptance does not pass')
evidence['product_gates'] = 'PASS'
evidence['deerflow_bridge'] = 'PASS' if all(stage['analysis_engine'] == 'DEERFLOW' for stage in evidence['stages'] if 'analysis_engine' in stage) else 'FAIL'
evidence['result'] = 'PASS' if evidence['deerflow_bridge'] == 'PASS' else 'DEGRADED'
(out / 'proof.json').write_text(json.dumps(evidence, indent=2))
print(f"{evidence['result']}: product gates PASS; DeerFlow bridge {evidence['deerflow_bridge']}", flush=True)
