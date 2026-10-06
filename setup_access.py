#!/usr/bin/env python3
"""Collect one-time Supabase setup access locally. Does not send anything."""
import getpass
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlparse

if not sys.stdin.isatty():
    raise SystemExit('Run this helper directly in your Terminal so the token can be entered without echo.')

print('Supabase CRM setup — stored only on this computer, never sent by this helper.')
project = input('Project URL (https://PROJECT.supabase.co), or dashboard project URL: ').strip()
u = urlparse(project)
project_ref = ''
if u.scheme == 'https' and (u.hostname or '').endswith('.supabase.co'):
    project_ref = u.hostname.split('.')[0]
elif u.scheme == 'https' and u.hostname == 'supabase.com':
    match = re.search(r'/dashboard/project/([a-z0-9]+)(?:/|$)', u.path)
    if match:
        project_ref = match.group(1)
if not re.fullmatch(r'[a-z0-9]{10,40}', project_ref):
    raise SystemExit('Could not identify the project. Use its supabase.co URL or dashboard project URL.')
email = input('Email you want to use to sign in to the CRM website: ').strip()
if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
    raise SystemExit('Please use a valid email address.')
token = getpass.getpass('Supabase personal access token (hidden; do not paste it in chat): ').strip()
if not token or any(c.isspace() for c in token):
    raise SystemExit('No valid token supplied. Nothing saved.')
target = Path(__file__).resolve().parent / 'supabase-setup-access.private.json'
flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
if hasattr(os, 'O_NOFOLLOW'):
    flags |= os.O_NOFOLLOW
fd = os.open(target, flags, 0o600)
os.fchmod(fd, 0o600)
with os.fdopen(fd, 'w') as output:
    json.dump({'project_ref': project_ref, 'project_url': f'https://{project_ref}.supabase.co',
               'login_email': email, 'management_access_token': token}, output, indent=2)
print('Setup access saved with owner-only file permissions. No network requests made.')
print('Tell Codex: "Supabase setup access is ready."')
