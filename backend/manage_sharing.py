#!/usr/bin/env python3
"""Enable, narrow, or disable the audience view. Never shares contacts or notes."""
import argparse
import json
from pathlib import Path

from setup_backend import call

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['company_roles', 'totals', 'off'])
    args = parser.parse_args()
    config = json.loads((ROOT / 'sync/config.private.json').read_text())
    call(config['SUPABASE_URL'] + '/rest/v1/crm_shared_views?on_conflict=share_slug',
         {'apikey': config['SUPABASE_SECRET_KEY'], 'Prefer': 'resolution=merge-duplicates'},
         'POST', {'share_slug': 'job-search', 'owner_id': config['CRM_OWNER_ID'],
                  'detail_level': 'totals' if args.mode == 'off' else args.mode,
                  'enabled': args.mode != 'off'})
    print('Audience view: ' + args.mode)


if __name__ == '__main__':
    main()
