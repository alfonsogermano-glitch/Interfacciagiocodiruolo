import importlib.util
from pathlib import Path
import re
import unittest

here = Path(__file__).parent
spec = importlib.util.spec_from_file_location('legal_routes', here/'prepare-public-legal-routes.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
# Minimal fixture of the current public mount/alias layout, with independent
# staging and apex blocks to prove preservation. Not a replacement live config.
BEFORE = '''staging.hollowgate.quest {
  respond "private staging unchanged" 401
}

www.hollowgate.quest {
  encode zstd gzip
  @publicAuthPages path / /login /signup /account/verify-email
  handle @publicAuthPages {
    root * /srv/auth-preview
    rewrite * /index.trial.html
    file_server
  }
  @vttAssets path /vtt/assets/*
  handle @vttAssets {
    uri strip_prefix /vtt
    root * /srv/vtt-pilot
    file_server
  }
  @frontendEntry path /vtt /vtt/
  handle @frontendEntry {
    root * /srv/vtt-pilot
    rewrite * /index.html
    file_server
  }
  @api path /auth/* /vtt/* /health /ready
  handle @api {
    reverse_proxy hollowgate-production-api:3000
  }
  handle {
    respond "Not Found" 404
  }
}

hollowgate.quest {
  redir https://www.hollowgate.quest{uri} permanent
}
'''


class PublicLegalRouteTests(unittest.TestCase):
    def test_adds_only_one_block_without_touching_auth_or_api(self):
        after = module.candidate(BEFORE)
        self.assertEqual(after.replace(module.BLOCK, '', 1), BEFORE)
        self.assertLess(after.index('@publicLegalPages'), after.index(module.ANCHOR))
        self.assertIn('reverse_proxy hollowgate-production-api:3000', after)

    def test_only_two_explicit_static_paths_can_reach_legal_root(self):
        self.assertIn('@publicLegalPages path /privacy /elimina-dati\n', module.BLOCK)
        self.assertNotIn('/auth/', module.BLOCK)
        self.assertNotIn('reverse_proxy', module.BLOCK)
        self.assertIn('rewrite * {path}.html', module.BLOCK)

    def test_repeat_foreign_or_ambiguous_public_site_is_rejected(self):
        for source in (module.candidate(BEFORE), BEFORE.replace('www.hollowgate.quest {', 'other.example {'),
                       BEFORE+'\nwww.hollowgate.quest {\n}\n',
                       BEFORE.replace(module.ANCHOR, '  @other path /vtt\n'),
                       (here.parent/'Caddyfile.auth-trial').read_text(),
                       (here.parent/'production/Caddyfile.production').read_text()):
            with self.subTest(source=source[:20]), self.assertRaises(ValueError):
                module.candidate(source)

    def test_staging_and_apex_bytes_are_unchanged(self):
        pattern = r'^www\.hollowgate\.quest \{\n.*?^\}'
        self.assertEqual(re.sub(pattern, '', BEFORE, flags=re.M | re.S),
                         re.sub(pattern, '', module.candidate(BEFORE), flags=re.M | re.S))


if __name__ == '__main__':
    unittest.main()
