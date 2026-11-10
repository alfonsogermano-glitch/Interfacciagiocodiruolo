#!/usr/bin/env python3
"""Synthetic fixture tests; no remote API, secrets, CLI or database."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[2] / "scripts" / "audit-staging-migrations.py"
spec = importlib.util.spec_from_file_location("migration_audit", SOURCE)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class MigrationReadinessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "supabase/migrations").mkdir(parents=True)
        for func in ("make-server-771c5bfd", "dice-secret-roll"):
            p = self.root / "supabase/functions" / func / "index.ts"
            p.parent.mkdir(parents=True)
            p.write_text("// synthetic function\n")

    def test_missing_baseline_blocks_deployment(self):
        (self.root / "supabase/migrations/20260101000000_chat.sql").write_text(
            "CREATE TABLE IF NOT EXISTS chat_messages (id uuid);\n"
        )
        result = audit.inspect(self.root)
        self.assertFalse(result["ready_for_schema_apply"])
        self.assertIn("campaigns", result["missing_baseline_tables"])

    def test_permissive_rls_and_legacy_files_block(self):
        (self.root / "supabase/20260101000000_chat.sql").write_text(
            "CREATE POLICY readable ON chat_messages FOR SELECT USING (true);\n"
        )
        result = audit.inspect(self.root)
        self.assertFalse(result["ready_for_schema_apply"])
        self.assertEqual(len(result["permissive_policy_files"]), 1)
        self.assertEqual(result["legacy_root_sql_files"], 1)

    def test_synthetic_complete_baseline_passes(self):
        (self.root / "supabase/migrations/20260101000000_baseline.sql").write_text(
            "".join(f"CREATE TABLE public.{table} (id uuid);\n" for table in audit.BASE_TABLES)
        )
        result = audit.inspect(self.root)
        self.assertTrue(result["ready_for_schema_apply"])
        self.assertEqual(result["missing_baseline_tables"], [])

    def test_missing_function_blocks(self):
        (self.root / "supabase/migrations/20260101000000_baseline.sql").write_text(
            "".join(f"CREATE TABLE {table} (id uuid);\n" for table in audit.BASE_TABLES)
        )
        (self.root / "supabase/functions/dice-secret-roll/index.ts").unlink()
        result = audit.inspect(self.root)
        self.assertFalse(result["ready_for_schema_apply"])
        self.assertTrue(any("dice" in x for x in result["blockers"]))

if __name__ == "__main__":
    unittest.main()
