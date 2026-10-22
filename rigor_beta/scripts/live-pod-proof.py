"""Exercise live source review, eight contradictions and change impact in an isolated session.

Run: python scripts/live-pod-proof.py --url https://rigor-flow-preview.netlify.app
Outputs are local evidence. Never writes to another tester's workspace.
"""
import argparse
import http.cookiejar
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--url', required=True)
parser.add_argument('--output', default='.artifacts/live-pod-proof')
parser.add_argument('--allow-fallback', action='store_true', help='Test product gates even if the DeerFlow bridge fails; bridge remains an explicit failed gate.')
parser.add_argument('--compatible-labor-wording', action='store_true', help='Isolate the known provides-verb defect on b7c9fee; this is not proof that defect is fixed.')
args = parser.parse_args()
base = args.url.rstrip('/')
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
evidence = {'url': base, 'stages': []}

def request(path, data=None, method='GET', expected=200, headers=None, raw=False):
    if isinstance(data, dict):
        data = json.dumps(data).encode()
        headers = {'Content-Type': 'application/json', **(headers or {})}
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers or {})
    try:
        response = opener.open(req, timeout=120)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read()
        assert response.status == expected, (path, response.status, body[:300])
    return body if raw else json.loads(body)

def upload(name, text):
    boundary = 'rigor-pod-proof-boundary'
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
            f'Content-Type: text/plain\r\n\r\n{text}\r\n--{boundary}--\r\n').encode()
    payload = request('/api/documents', body, 'POST', headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    evidence['stages'].append({'upload': name, **payload['result']})
    (out / 'proof.json').write_text(json.dumps(evidence, indent=2))
    if not args.allow_fallback:
        assert payload['result']['analysis_engine'] == 'DEERFLOW', payload['result']
    print(json.dumps(evidence['stages'][-1]), flush=True)
    return payload['workspace']

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
evidence['product_gates'] = 'PASS'
evidence['deerflow_bridge'] = 'PASS' if all(stage['analysis_engine'] == 'DEERFLOW' for stage in evidence['stages'] if 'analysis_engine' in stage) else 'FAIL'
evidence['result'] = 'PASS' if evidence['deerflow_bridge'] == 'PASS' else 'DEGRADED'
(out / 'proof.json').write_text(json.dumps(evidence, indent=2))
print(f"{evidence['result']}: product gates PASS; DeerFlow bridge {evidence['deerflow_bridge']}", flush=True)
