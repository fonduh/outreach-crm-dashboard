#!/usr/bin/env python3
"""Install login services. No secrets are put in launchd plists or arguments."""
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
config = json.loads((ROOT / 'sync/config.private.json').read_text())
crm = Path(config['CRM_ROOT']).resolve()
agents = Path.home() / 'Library/LaunchAgents'
logs = Path.home() / 'Library/Logs/outreach-crm'
agents.mkdir(parents=True, exist_ok=True)
logs.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(logs, 0o700)
domain = f'gui/{os.getuid()}'

for label, args, cwd, stdout in [
    ('com.fondahu.outreach-crm-server', [sys.executable, str(crm / 'server.py')], crm, '/dev/null'),
    ('com.fondahu.outreach-crm-sync', [sys.executable, str(ROOT / 'sync/run_sync.py'), '--interval', '30'], ROOT, str(logs / 'sync.log')),
]:
    path = agents / (label + '.plist')
    subprocess.run(['launchctl', 'bootout', domain + '/' + label], capture_output=True)
    if label.endswith('-server'):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=5) as response:
                health = json.load(response)
            if Path(health['dir']).resolve() != crm:
                raise SystemExit('Port 8765 belongs to another CRM; left untouched.')
            subprocess.run([sys.executable, str(crm / 'server.py'), '--stop'], cwd=crm,
                           stdout=subprocess.DEVNULL, check=True)
            time.sleep(1)
        except OSError:
            pass
    error_log = logs / (label.rsplit('-', 1)[-1] + '-error.log')
    for log in [error_log, Path(stdout)]:
        if str(log) != '/dev/null':
            fd = os.open(log, os.O_WRONLY | os.O_CREAT, 0o600)
            os.close(fd)
            os.chmod(log, 0o600)
    content = {'Label': label, 'ProgramArguments': args, 'WorkingDirectory': str(cwd),
               'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 30,
               'ProcessType': 'Background', 'StandardOutPath': stdout,
               'StandardErrorPath': str(error_log), 'Umask': 0o077}
    path.write_bytes(plistlib.dumps(content))
    os.chmod(path, 0o600)
    result = subprocess.run(['launchctl', 'bootstrap', domain, str(path)], capture_output=True)
    if result.returncode:
        raise SystemExit(f'Could not load {label}; launchctl exit {result.returncode}')
    print('Installed and started ' + label)
