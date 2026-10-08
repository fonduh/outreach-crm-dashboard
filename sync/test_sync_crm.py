import copy
import http.client
import unittest
from unittest.mock import patch
from sync_crm import cycle, process_requests, Remote as SupabaseRemote, request_json

class Local:
    def __init__(self):
        self.payload = {'ok': True, 'read_at': 'initial', 'jobs': [{'id': 'J001'}],
                        'companies': [{'id': 'CO001', 'relationship_tags': ''}],
                        'contacts': [], 'job_contacts': [], 'job_activity': []}
        self.writes = 0
    def read(self): return copy.deepcopy(self.payload)
    def set_tags(self, company_id, tags):
        self.writes += 1
        self.payload['companies'][0]['relationship_tags'] = '|'.join(tags)

class Remote:
    def __init__(self, requests=()):
        self.requests = list(requests)
        self.done, self.uploads = [], []
    def pending(self): return copy.deepcopy(self.requests)
    def finish(self, request_id, status, error=None):
        self.done.append((request_id, status, error))
        self.requests = [r for r in self.requests if r['id'] != request_id]
    def publish(self, payload, revision): self.uploads.append((copy.deepcopy(payload), revision))

def change(tags, expected):
    return {'id': 'request-1', 'company_id': 'CO001', 'tags': tags, 'expected_tags': expected}

class SyncTests(unittest.TestCase):
    def test_transient_disconnect_is_retryable_without_exposing_response(self):
        for error in [http.client.RemoteDisconnected('private upstream detail'), TimeoutError('private host')]:
            with self.subTest(error=type(error).__name__), patch('urllib.request.urlopen', side_effect=error):
                with self.assertRaisesRegex(RuntimeError, '^Connection failed; check that the server and network are available$'):
                    request_json('https://example.supabase.co')

    def test_modern_secret_uses_api_key_header_only(self):
        with patch.dict('os.environ', {'SUPABASE_URL':'https://example.supabase.co',
                        'CRM_OWNER_ID':'00000000-0000-0000-0000-000000000001',
                        'SUPABASE_SECRET_KEY':'sb_secret_test'}, clear=True):
            self.assertEqual(SupabaseRemote().headers, {'apikey':'sb_secret_test'})
    def test_queued_write_verified_then_published(self):
        local, remote = Local(), Remote([change(['champion', 'executive_sponsor'], [])])
        cycle(local, remote)
        self.assertEqual(local.writes, 1)
        self.assertEqual(remote.done[0][1], 'applied')
        self.assertEqual(remote.uploads[0][0]['companies'][0]['relationship_tags'], 'champion|executive_sponsor')
    def test_conflict_preserves_newer_local_value(self):
        local = Local(); local.payload['companies'][0]['relationship_tags'] = 'executive_sponsor'
        remote = Remote([change(['champion'], [])])
        process_requests(local, remote)
        self.assertEqual(local.writes, 0)
        self.assertEqual(remote.done[0][1], 'rejected')
    def test_acknowledgement_retry_is_idempotent(self):
        local = Local(); local.payload['companies'][0]['relationship_tags'] = 'champion'
        remote = Remote([change(['champion'], [])])
        process_requests(local, remote)
        self.assertEqual(local.writes, 0)
        self.assertEqual(remote.done[0][1], 'applied')
    def test_only_changed_payloads_upload(self):
        local, remote = Local(), Remote()
        revision = cycle(local, remote)
        local.payload['read_at'] = 'later'
        self.assertEqual(cycle(local, remote, revision), revision)
        self.assertEqual(len(remote.uploads), 1)
    def test_invalid_tags_rejected(self):
        local, remote = Local(), Remote([change(['administrator'], [])])
        process_requests(local, remote)
        self.assertEqual(local.writes, 0)
        self.assertEqual(remote.done[0][1], 'rejected')

if __name__ == '__main__': unittest.main()
