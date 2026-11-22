import importlib.util
from pathlib import Path
import unittest

here = Path(__file__).parent
spec = importlib.util.spec_from_file_location('assembler', here/'assemble-staging-campaign-sql.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AssemblyTests(unittest.TestCase):
    def test_comments_before_begin_are_preserved(self):
        source = '-- reviewed migration\nBEGIN;\nSELECT 1;\nCOMMIT;\n'
        self.assertEqual(module.unwrap(source), '-- reviewed migration\nSELECT 1;\n')

    def test_missing_duplicate_or_unexpected_wrappers_are_rejected(self):
        for source in ('SELECT 1;', 'BEGIN;\nBEGIN;\nCOMMIT;\n',
                       'BEGIN;\nROLLBACK;\nCOMMIT;\n', 'SELECT 1;\nBEGIN;\nCOMMIT;'):
            with self.subTest(source=source), self.assertRaises(ValueError):
                module.unwrap(source)

    def test_all_eight_real_files_assemble_without_changing_function_bodies(self):
        sql = module.assemble(here.parent/'sql')
        self.assertEqual(sql.count('-- SOURCE:'), 8)
        self.assertNotIn('\nCOMMIT;', sql)
        self.assertNotIn('\nBEGIN;', sql)
        self.assertIn('INSERT INTO hollowgate_vtt.campaign_members', sql)
        self.assertIn('CREATE TABLE hollowgate_vtt.campaign_members', sql)
        self.assertLess(sql.index('CREATE TABLE hollowgate_vtt.campaign_members'),
                        sql.index('CREATE TABLE hollowgate_vtt.campaign_invites'))

    def test_037_and_its_database_guard_are_not_in_the_plan(self):
        sql = module.assemble(here.parent/'sql')
        self.assertNotIn('CREATE ROLE', sql)
        self.assertNotIn('037_staging_database_role', sql)
        self.assertNotIn('hollowgate_auth_staging_app', sql)


if __name__ == '__main__':
    unittest.main()
