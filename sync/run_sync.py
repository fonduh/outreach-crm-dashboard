#!/usr/bin/env python3
"""Load owner-only local configuration and run the sync without shell secrets."""
import json
import os
from pathlib import Path
import stat
import sys

config = Path(__file__).resolve().with_name('config.private.json')
if stat.S_IMODE(config.stat().st_mode) & 0o077:
    raise SystemExit('Sync config must have owner-only permissions (chmod 600).')
values = json.loads(config.read_text())
allowed = {'CRM_ROOT', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRM_OWNER_ID'}
if set(values) - allowed or not all(isinstance(v, str) for v in values.values()):
    raise SystemExit('Unexpected sync configuration fields.')
os.environ.update(values)
os.execv(sys.executable, [sys.executable, str(config.with_name('sync_crm.py')), *sys.argv[1:]])
