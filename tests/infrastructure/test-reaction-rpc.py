#!/usr/bin/env python3
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
SQL=(ROOT/"docs/security/proposals/chat_reaction_rpc_staging_only.sql").read_text()
SHELL=(ROOT/"infra/staging/reaction-rpc-smoke-test.sh").read_text()
DICE=(ROOT/"src/app/components/session/dice/DiceSessionContext.tsx").read_text()
FLOW=(ROOT/".github/workflows/staging-preflight.yml").read_text()
class ReactionRpcContract(unittest.TestCase):
    def test_reaction_rpc_is_explicitly_authorized(self):
        for x in ("SECURITY DEFINER","SET search_path = ''","auth.uid()","FOR UPDATE","c.deleted_at IS NULL","cm.profile_id = v_actor::text","REVOKE ALL ON FUNCTION","TO authenticated"):
            self.assertIn(x,SQL)
        self.assertNotIn("CREATE POLICY chat_messages_update",SQL)
    def test_sender_only_persists_roll(self):
        self.assertIn("result.visibility === 'public' && result.rollerId === user?.id",DICE)
        self.assertIn("pendingChatRolls.current.set(result.id, result);",DICE)
    def test_sql_runtime_matrix(self):
        for x in ("expect_denied outsider","expect_denied different_campaign","expect_denied oversized_char","expect_denied unauthenticated","multi-user reactions overwritten","raw message update authorized"):
            self.assertIn(x,SHELL)
        self.assertIn("bash infra/staging/reaction-rpc-smoke-test.sh",FLOW)
if __name__=="__main__": unittest.main()
