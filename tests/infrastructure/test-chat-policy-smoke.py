#!/usr/bin/env python3
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
RUNNER=(ROOT/"infra/staging/chat-policy-smoke-test.sh").read_text()
FLOW=(ROOT/".github/workflows/staging-preflight.yml").read_text()
SQL=(ROOT/"docs/security/proposals/chat_rls_staging_only.sql").read_text()
class ChatProposalContract(unittest.TestCase):
    def test_executes_proposal_file(self):
        self.assertIn("< docs/security/proposals/chat_rls_staging_only.sql",RUNNER)
        self.assertIn("CREATE FUNCTION auth.uid()",RUNNER)
        self.assertIn("SET LOCAL ROLE authenticated",RUNNER)
    def test_negative_campaign_and_sender(self):
        for token in ("assert_denied cross_campaign","assert_denied spoof_sender","assert_denied outsider_insert","assert_count \"$OUTSIDER\" 0","UPDATE public.chat_messages"):
            self.assertIn(token,RUNNER)
    def test_isolated_ci_integration(self):
        self.assertIn("bash infra/staging/chat-policy-smoke-test.sh",FLOW)
        self.assertIn("docker compose -f infra/staging/docker-compose.yml down -v",FLOW)
    def test_proposal_has_real_restrictions(self):
        self.assertIn("chat_messages_select",SQL)
        self.assertIn("chat_messages_insert",SQL)
        self.assertIn("sender_id = (SELECT auth.uid())::text",SQL)
if __name__=="__main__": unittest.main()
