#!/usr/bin/env python3
"""Static regressions for opt-in, synthetic PostgreSQL staging job."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
WORKFLOW=(ROOT/".github/workflows/staging-preflight.yml").read_text()
SCRIPT=(ROOT/"infra/staging/rls-smoke-test.sh").read_text()
COMPOSE=(ROOT/"infra/staging/docker-compose.yml").read_text()
class StagingLiveContract(unittest.TestCase):
    def test_isolated_compose(self):
        self.assertIn("postgres:17-alpine",COMPOSE)
        self.assertNotIn("ports:",COMPOSE)
    def test_workflow_runs_actual_restore(self):
        self.assertIn("bash infra/staging/smoke-test.sh",WORKFLOW)
        self.assertIn("bash infra/staging/rls-smoke-test.sh",WORKFLOW)
        self.assertIn("docker compose -f infra/staging/docker-compose.yml down -v",WORKFLOW)
        self.assertIn("STAGING_CONFIRM: LOCAL_ONLY",WORKFLOW)
    def test_actor_isolation_and_negative_insert(self):
        for actor in ("gm_a","player_a","gm_b","player_b","outsider"):
            self.assertIn("expect_count "+actor,SCRIPT)
        self.assertIn("ALTER TABLE public.hollowgate_fixture_message ENABLE ROW LEVEL SECURITY",SCRIPT)
        self.assertIn("FAIL: cross-campaign INSERT unexpectedly succeeded",SCRIPT)
        self.assertIn('"${STAGING_CONFIRM:-}" == "LOCAL_ONLY"',SCRIPT)
if __name__=="__main__":unittest.main()
