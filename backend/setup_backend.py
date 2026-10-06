#!/usr/bin/env python3
"""Configure the selected private CRM project using locally supplied access.

Never prints keys or user details, sends emails, or publishes CRM records to Git.
"""
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://fonduh.github.io/outreach-crm-dashboard/'


def private_json(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as file:
        json.dump(value, file, indent=2)


def call(url, headers, method='GET', body=None):
    req = urllib.request.Request(url, method=method,
        headers={'Content-Type': 'application/json', **headers},
        data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'{method} failed with HTTP {error.code}; no credentials logged') from None
    except urllib.error.URLError:
        raise RuntimeError('Network request failed') from None


def main():
    setup = json.loads((ROOT / 'supabase-setup-access.private.json').read_text())
    base = 'https://api.supabase.com/v1/projects/' + setup['project_ref']
    headers = {'Authorization': 'Bearer ' + setup['management_access_token']}
    project = call(base, headers)
    if project.get('status') != 'ACTIVE_HEALTHY':
        raise RuntimeError('Project is not healthy yet')
    keys = call(base + '/api-keys?reveal=true', headers)
    public_key = next(k['api_key'] for k in keys if k.get('type') == 'publishable')
    secret_key = next(k['api_key'] for k in keys if k.get('type') == 'secret')
    if not public_key.startswith('sb_publishable_') or not secret_key.startswith('sb_secret_'):
        raise RuntimeError('Expected modern publishable and secret keys')
    auth = call(base + '/config/auth', headers)
    backup = ROOT / 'supabase-auth-before.private.json'
    if not backup.exists():
        private_json(backup, auth)
    call(base + '/database/query', headers, 'POST',
         {'query': (ROOT / 'backend/schema.sql').read_text()})
    print('Private tables and owner access policies configured.')
    redirects = set(filter(None, (auth.get('uri_allow_list') or '').split(',')))
    redirects.add(SITE)
    call(base + '/config/auth', headers, 'PATCH', {
        'site_url': SITE, 'uri_allow_list': ','.join(sorted(redirects)),
        'disable_signup': True, 'external_anonymous_users_enabled': False,
        'external_email_enabled': True, 'mailer_autoconfirm': False})
    admin_headers = {'apikey': secret_key}
    users = []
    for page in range(1, 101):
        result = call(setup['project_url'] + f'/auth/v1/admin/users?page={page}&per_page=100', admin_headers)
        batch = result.get('users', [])
        users.extend(batch)
        if len(batch) < 100:
            break
    owner = next((u for u in users if u.get('email', '').lower() == setup['login_email'].lower()), None)
    if owner is None:
        owner = call(setup['project_url'] + '/auth/v1/admin/users', admin_headers, 'POST',
                     {'email': setup['login_email'], 'email_confirm': False})
    private_json(ROOT / 'sync/config.private.json', {
        'CRM_ROOT': str(Path.home() / 'Documents/outreach-crm'),
        'SUPABASE_URL': setup['project_url'], 'SUPABASE_SECRET_KEY': secret_key,
        'CRM_OWNER_ID': owner['id']})
    # These two values are public by design. Never include owner/email/server keys.
    (ROOT / 'site/config.js').write_text('window.CRM_PUBLIC_CONFIG = ' +
        json.dumps({'url': setup['project_url'], 'key': public_key}) + ';\n')
    verified = call(base + '/config/auth', headers)
    assert verified['disable_signup'] is True and verified['site_url'] == SITE
    print('Sign-in configured; account provisioned without sending email.')
    print('Private sync configuration saved; public browser configuration prepared.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, KeyError, StopIteration) as error:
        print('Setup stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
