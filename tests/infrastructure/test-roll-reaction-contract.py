#!/usr/bin/env python3
"""No-network static contract for secret-roll relay and chat persistence boundaries."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[2]
EDGE=(ROOT/"supabase/functions/dice-secret-roll/index.ts").read_text()
CHAT=(ROOT/"src/services/supabase/chatService.ts").read_text()
WORKFLOW=(ROOT/".github/workflows/staging-preflight.yml").read_text()
SQL=(ROOT/"infra/staging/roll-reaction-smoke-test.sh").read_text()

class RollAndReactionContract(unittest.TestCase):
    def test_secret_relay_validates_actor_and_membership(self):
        for needle in (
            'auth.getUser(token)',
            'result.rollerId !== user.id',
            'result.campaignId!==campaignId',
            "ownerProfileId === user.id",
            "eq('profile_id',user.id)",
            "if(!membership)",
            'private:true',
            "channel.httpSend('dice_roll', result)",
        ):
            self.assertIn(needle,EDGE)
    def test_secret_not_persisted_and_public_roll_ownership(self):
        self.assertIn("if (roll.visibility !== 'public') return null;",CHAT)
        self.assertIn("sender_id: roll.rollerId",CHAT)
        self.assertIn('ignoreDuplicates: true',CHAT)
    def test_reactions_need_secure_write_mechanism(self):
        self.assertIn(".update({ reactions: next })",CHAT)
        self.assertIn("UPDATE public.chat_messages",SQL)
        self.assertIn("unrestricted reaction UPDATE unexpectedly authorized",SQL)
    def test_database_isolation_and_ci(self):
        self.assertIn("STAGING_CONFIRM",SQL)
        self.assertIn("assert_rejected delegated_public_roll",SQL)
        self.assertIn("bash infra/staging/roll-reaction-smoke-test.sh",WORKFLOW)
    def test_no_secret_relay_persistence(self):
        self.assertNotIn(".from('chat_messages')",EDGE)
        self.assertIn("if(result.visibility !== 'secret')",EDGE)
if __name__=="__main__":
    unittest.main()
