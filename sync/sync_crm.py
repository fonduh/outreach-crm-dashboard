#!/usr/bin/env python3
"""Export locally, or mirror the local CRM to an authenticated Supabase project.

No third-party packages. The local CRM server must be running on 127.0.0.1:8765.
CRM_ROOT points to its CSV workspace. This script never uploads to GitHub.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ALLOWED_TAGS = {'champion', 'executive_sponsor'}


def request_json(url, method='GET', body=None, headers=None):
    request = urllib.request.Request(url, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        # Do not dump request headers, keys, private records, or server responses.
        raise RuntimeError(f'{method} request failed with HTTP {error.code}') from None
    except urllib.error.URLError:
        raise RuntimeError('Connection failed; check that the server and network are available') from None


class LocalCRM:
    def __init__(self, root):
        self.root = Path(root).expanduser().resolve()
        self.headers = {'X-CRM-Token': (self.root / '.crm_token').read_text().strip()}

    def read(self):
        health = request_json('http://127.0.0.1:8765/health')
        if Path(health['dir']).resolve() != self.root:
            raise RuntimeError('The running CRM server belongs to a different workspace')
        data = request_json('http://127.0.0.1:8765/dashboard-data', headers=self.headers)
        if not data.get('ok'):
            raise RuntimeError('Local CRM read failed')
        for key in ['jobs', 'companies', 'contacts', 'job_activity', 'job_contacts']:
            if not isinstance(data.get(key), list):
                raise RuntimeError('Local CRM response has an unexpected schema')
        return data

    def set_tags(self, company_id, tags):
        result = request_json('http://127.0.0.1:8765/company-tags', method='POST',
            headers=self.headers, body={'company_id': company_id, 'tags': tags})
        if not result.get('ok'):
            raise RuntimeError('Local company tag update failed')


class Remote:
    def __init__(self):
        self.url = os.environ['SUPABASE_URL'].rstrip('/')
        if urllib.parse.urlparse(self.url).scheme != 'https':
            raise RuntimeError('SUPABASE_URL must use HTTPS')
        self.owner = str(uuid.UUID(os.environ['CRM_OWNER_ID']))
        key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
        if not key.startswith('eyJ'):
            raise RuntimeError('Use the legacy service_role JWT for the local sync only')
        self.headers = {'apikey': key, 'Authorization': 'Bearer ' + key}

    def call(self, path, method='GET', body=None, prefer=None):
        headers = dict(self.headers)
        if prefer:
            headers['Prefer'] = prefer
        return request_json(self.url + '/rest/v1/' + path, method, body, headers)

    def pending(self):
        return self.call('crm_tag_requests?owner_id=eq.' + self.owner +
                         '&status=eq.pending&order=created_at.asc,id.asc')

    def finish(self, request_id, status, error=None):
        request_id = str(uuid.UUID(request_id))
        self.call('crm_tag_requests?id=eq.' + request_id + '&owner_id=eq.' + self.owner,
            'PATCH', {'status': status, 'processed_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'error': error})

    def publish(self, payload, revision):
        self.call('crm_snapshots?on_conflict=owner_id', 'POST',
            {'owner_id': self.owner, 'payload': payload, 'revision': revision,
             'updated_at': dt.datetime.now(dt.timezone.utc).isoformat()},
            prefer='resolution=merge-duplicates')


def process_requests(local, remote):
    count = 0
    for change in remote.pending():
        tags, expected = change.get('tags'), change.get('expected_tags')
        if (not isinstance(tags, list) or any(not isinstance(t, str) or t not in ALLOWED_TAGS for t in tags)
            or len(set(tags)) != len(tags) or not isinstance(expected, list)):
            remote.finish(change['id'], 'rejected', 'Invalid tag selection')
            continue
        data = local.read()
        company = next((c for c in data['companies'] if c['id'] == change['company_id']), None)
        if not company:
            remote.finish(change['id'], 'rejected', 'Company no longer exists in the local CRM')
            continue
        current = set(filter(None, company.get('relationship_tags', '').split('|')))
        if current == set(tags):
            # Idempotent retry after a local write succeeded but cloud acknowledgement failed.
            remote.finish(change['id'], 'applied')
            continue
        if current != set(expected):
            remote.finish(change['id'], 'rejected', 'Company tags changed locally; refresh and try again')
            continue
        local.set_tags(company['id'], tags)
        # Read back before acknowledging success to the website.
        check = next(c for c in local.read()['companies'] if c['id'] == company['id'])
        if set(filter(None, check.get('relationship_tags', '').split('|'))) != set(tags):
            raise RuntimeError('Local tag write did not persist; request remains pending')
        remote.finish(change['id'], 'applied')
        count += 1
    return count


def cycle(local, remote, last_revision=None):
    changed = process_requests(local, remote)
    payload = local.read()
    canonical = {k: v for k, v in payload.items() if k != 'read_at'}
    revision = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
    if revision != last_revision:
        remote.publish(payload, revision)
        print(f'Synced {len(payload["jobs"])} jobs; applied {changed} queued tag changes.', flush=True)
    return revision


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export-only', type=Path, help='Write a private local snapshot; do not contact Supabase')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--interval', type=int, default=30)
    args = parser.parse_args()
    root = os.environ.get('CRM_ROOT')
    if not root:
        parser.error('Set CRM_ROOT to your local CRM folder')
    if args.interval < 5:
        parser.error('--interval must be at least 5 seconds')
    local = LocalCRM(root)
    if args.export_only:
        payload = local.read()
        target = args.export_only.expanduser()
        target.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as output:
            json.dump(payload, output, ensure_ascii=False, indent=2)
        print(f'Private snapshot exported: {len(payload["jobs"])} jobs. No cloud upload.')
        return
    remote = Remote()
    # Only one publisher per workspace; held for the lifetime of the process.
    with (local.root / '.crm_cloud_sync.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('A CRM cloud sync is already running') from None
        revision = None
        while True:
            try:
                revision = cycle(local, remote, revision)
            except (RuntimeError, KeyError, ValueError) as error:
                if args.once:
                    raise
                print('Sync paused for this cycle: ' + str(error), file=sys.stderr, flush=True)
            if args.once:
                return
            time.sleep(args.interval)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, KeyError, FileNotFoundError, ValueError) as error:
        print('Sync unavailable: ' + str(error), file=sys.stderr)
        sys.exit(1)
