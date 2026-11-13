import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[4]
TURN = ROOT / "deploy" / "aruba" / "turn"

class TurnStagingConfigTest(unittest.TestCase):
    def test_compose_is_manual_only_and_isolated(self):
        value = (TURN / "compose.turn.staging.yaml").read_text()
        self.assertIn('profiles: ["manual-turn"]', value)
        self.assertIn("network_mode: host", value)
        self.assertIn('restart: "no"', value)
        self.assertIn("read_only: true", value)
        self.assertIn("cap_drop: [ALL]", value)
        self.assertIn("coturn/coturn:4.18.0-r0-alpine", value)
        self.assertNotIn("privileged: true", value)
        self.assertNotIn("AUTH_VTT_TURN_ENABLED: true", value)

    def test_secret_and_tls_mounted_not_embedded(self):
        compose = (TURN / "compose.turn.staging.yaml").read_text()
        script = (TURN / "start-turn.sh").read_text()
        self.assertIn("/run/secrets/turn_shared_secret:ro", compose)
        self.assertIn("/run/tls/turn-privkey.pem:ro", compose)
        self.assertIn("umask 077", script)
        self.assertIn("chmod 600", script)
        self.assertIn("static-auth-secret=%s", script)
        self.assertNotRegex(compose, r'(?m)^\s*static-auth-secret\s*[:=]')
        self.assertIn("no-cli", script)
        self.assertIn("use-auth-secret", script)
        self.assertIn("no-loopback-peers", script)

    def test_relay_port_range_and_documentation(self):
        script = (TURN / "start-turn.sh").read_text()
        readme = (TURN / "README.md").read_text()
        self.assertIn("min-port=49160", script)
        self.assertIn("max-port=49200", script)
        self.assertIn("tls-listening-port=5349", script)
        for port in ["3478/udp", "3478/tcp", "5349/tcp", "49160-49200/udp"]:
            self.assertIn(port, readme)
        self.assertIn("TURN_SHARED_SECRET_FILE", readme)

if __name__ == "__main__":
    unittest.main()
