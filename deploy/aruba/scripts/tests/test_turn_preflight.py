import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import Mock
import os

MODULE_PATH = pathlib.Path(__file__).resolve().parents[2] / "turn" / "qa" / "preflight.py"
spec = importlib.util.spec_from_file_location("hollowgate_turn_preflight", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class TurnPreflightTests(unittest.TestCase):
    def test_public_ip_dns_and_private_addresses_fail_closed(self):
        self.assertEqual(module.validated_identity("turn.example.org", "8.8.8.8", {"8.8.8.8"}),
                         ("turn.example.org", "8.8.8.8"))
        for host, ip, dns in [
            ("turn.example.org", "10.0.0.1", {"10.0.0.1"}),
            ("turn.example.org", "192.168.1.1", {"192.168.1.1"}),
            ("turn.example.org", "8.8.8.8", {"1.1.1.1"}),
            ("bad hostname", "8.8.8.8", {"8.8.8.8"}),
        ]:
            with self.assertRaises(module.PreflightError):
                module.validated_identity(host, ip, dns)

    def test_port_collisions_across_turn_and_relay_range(self):
        module.check_ports("Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port\n")
        for line in [
            "udp UNCONN 0 0 0.0.0.0:3478 0.0.0.0:*",
            "tcp LISTEN 0 128 *:5349 *:*",
            "udp UNCONN 0 0 [::]:49181 [::]:*",
        ]:
            with self.assertRaises(module.PreflightError):
                module.check_ports(line)
        module.check_ports("tcp LISTEN 0 128 127.0.0.1:443 *:*")

    def test_secret_owner_and_permissions_required(self):
        with tempfile.TemporaryDirectory() as folder:
            f = pathlib.Path(folder) / "secret"
            f.write_bytes(b"a"*64)
            f.chmod(0o600)
            module.inspect_file(f,os.getuid(),min_bytes=64)
            with self.assertRaises(module.PreflightError):
                module.inspect_file(f,65534 if os.getuid()!=65534 else 1001)
            f.chmod(0o644)
            with self.assertRaises(module.PreflightError):
                module.inspect_file(f,os.getuid())

    def test_certificate_and_key_match_without_exposing_key(self):
        def good(cmd,**kwargs):
            if "-pubkey" in cmd or "-pubout" in cmd:
                return Mock(returncode=0,stdout=b"PUBLIC-KEY\n")
            if "-checkhost" in cmd:
                return Mock(returncode=0,stdout=b"Hostname turn.example.org does match certificate\n")
            return Mock(returncode=0,stdout=b"")
        module.certificate_check(pathlib.Path("cert"),pathlib.Path("key"),"turn.example.org",good)
        def mismatch(cmd,**kwargs):
            if "-checkhost" in cmd:
                return Mock(returncode=0,stdout=b"Hostname turn.example.org does NOT match certificate\n")
            return good(cmd,**kwargs)
        with self.assertRaises(module.PreflightError):
            module.certificate_check(pathlib.Path("cert"),pathlib.Path("key"),"turn.example.org",mismatch)
        def wrong(cmd,**kwargs):
            if "-pubout" in cmd:
                return Mock(returncode=0,stdout=b"OTHER\n")
            if "-pubkey" in cmd:
                return Mock(returncode=0,stdout=b"PUBLIC\n")
            return Mock(returncode=0,stdout=b"")
        with self.assertRaises(module.PreflightError):
            module.certificate_check(pathlib.Path("cert"),pathlib.Path("key"),"turn.example.org",wrong)

if __name__ == "__main__":
    unittest.main()
