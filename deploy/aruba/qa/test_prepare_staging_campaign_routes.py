import importlib.util
from pathlib import Path
import unittest

here = Path(__file__).parent
spec = importlib.util.spec_from_file_location('staging_routes', here/'prepare-staging-campaign-routes.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CURRENT = (here.parent/'Caddyfile.staging-isolated').read_text()
# Keep a fixture of the old live matcher while ensuring future source builds
# include exactly the candidate that our one-line live patch will produce.
SOURCE = CURRENT.replace(module.OLD+' '+' '.join(module.ADDED), module.OLD)


class StagingRouteTests(unittest.TestCase):
    def test_exactly_one_line_changes_and_private_gate_remains(self):
        result = module.candidate(SOURCE)
        changed = [(a, b) for a, b in zip(SOURCE.splitlines(), result.splitlines()) if a != b]
        self.assertEqual(len(changed), 1)
        for route in module.ADDED:
            self.assertIn(route, changed[0][1])
        self.assertIn('basic_auth @private bcrypt', result)
        self.assertIn('not path /health /ready', result)

    def test_public_or_unexpected_layout_and_repeats_are_rejected(self):
        for source in (SOURCE+'\nwww.hollowgate.quest {}\n',
                       SOURCE.replace('@vttAPI path', '@other path'),
                       module.candidate(SOURCE), SOURCE.replace('basic_auth @private', 'basic_auth @other')):
            with self.subTest(source=source[:30]), self.assertRaises(ValueError):
                module.candidate(source)

    def test_added_endpoints_exist_in_real_http_handler(self):
        handler = (here.parents[2]/'apps/aruba-api/src/auth-http.mjs').read_text()
        for route in module.ADDED:
            self.assertIn(route.rstrip('*').rstrip('/'), handler)

    def test_local_staging_config_is_the_exact_fixed_candidate(self):
        self.assertEqual(module.candidate(SOURCE), CURRENT)


if __name__ == '__main__':
    unittest.main()
