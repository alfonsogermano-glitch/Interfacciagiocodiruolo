import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('backup-staging-storage.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class BackupTests(unittest.TestCase):
    def test_safe_names(self):
        for name in ('..', '.', '', '../secret', 'a/b', 'a\\b'):
            with self.assertRaises(ValueError):
                b.safe_name(name)

    def test_export_and_verify_and_detect_corruption(self):
        def fake_request(url, token, payload=None):
            if '/list/' in url:
                if payload['prefix'] == '':
                    return json.dumps([{'name': 'nested', 'id': None}]).encode()
                return json.dumps([{'name': 'pic.png', 'id': '1', 'metadata': {'size': 3}}]).encode()
            return b'abc'
        with tempfile.TemporaryDirectory() as tmp, patch.object(b, 'request', side_effect=fake_request):
            dest = Path(tmp) / 'export'
            self.assertEqual(b.export('https://staging.supabase.co', 'token', dest, ['images']), 1)
            self.assertEqual(b.verify(dest), 1)
            (dest / 'objects/images/nested/pic.png').write_bytes(b'bad')
            with self.assertRaises(ValueError):
                b.verify(dest)

    def test_nonempty_destination_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            (dest / 'existing').write_text('x')
            with self.assertRaises(ValueError):
                b.export('https://staging.supabase.co', 'token', dest, ['images'])


if __name__ == '__main__':
    unittest.main()
