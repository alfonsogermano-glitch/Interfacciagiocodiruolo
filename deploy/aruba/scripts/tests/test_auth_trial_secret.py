import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from importlib.machinery import SourceFileLoader
module = SourceFileLoader('normalize_auth_trial', str(Path(__file__).resolve().parents[1] / 'normalize-auth-trial-secret.py')).load_module()
hash_value = b'$2a$14$Zkx19XLiW6VYouLHR5NmfOFU0z2GTNmpkT/5qqR7hx4IjWJPDhjvG'

class SecretNormalizeTests(unittest.TestCase):
    def test_legacy_secret_migrates_without_changing_hash(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'secret'
            path.write_bytes(hash_value)
            module.normalize(path)
            self.assertEqual(path.read_bytes(), b'tester ' + hash_value + b'\n')
            module.normalize(path)
            self.assertEqual(path.read_bytes(), b'tester ' + hash_value + b'\n')
    def test_bad_or_multiline_secret_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'secret'
            path.write_bytes(b'not-a-valid-password\n')
            with self.assertRaises(ValueError): module.normalize(path)
            path.write_bytes(b'tester ' + hash_value + b'\nadmin abc')
            with self.assertRaises(ValueError): module.normalize(path)

if __name__ == '__main__': unittest.main()
