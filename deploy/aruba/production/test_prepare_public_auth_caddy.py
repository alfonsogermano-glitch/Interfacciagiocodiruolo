import importlib.util
import unittest
from pathlib import Path

script = Path(__file__).with_name('prepare-public-auth-caddy.py')
spec = importlib.util.spec_from_file_location('public_caddy', script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

FIXTURE = '''staging.hollowgate.quest {
  @trialPages path /login /signup /account/verify-email
  handle @trialPages { respond "staging" 200 }
}
www.hollowgate.quest {
  encode zstd gzip
  @publicAuthPages path / /login /forgot-password /account/password
  handle @publicAuthPages { respond "auth" 200 }
  @authPages path /login /forgot-password /account/password
  handle @authPages { respond "auth" 200 }
  @api path /auth/* /vtt/* /ready
  handle @api { reverse_proxy hollowgate-production-api:3000 }
}
hollowgate.quest {
  redir https://www.hollowgate.quest{uri} permanent
}
'''


class CaddyCandidateTests(unittest.TestCase):
    def test_changes_only_two_public_matchers(self):
        result = module.make_candidate(FIXTURE)
        expected = FIXTURE.replace(
            '@publicAuthPages path / /login /forgot-password /account/password',
            '@publicAuthPages path / /login /forgot-password /account/password /signup /account/verify-email'
        ).replace(
            '@authPages path /login /forgot-password /account/password',
            '@authPages path /login /forgot-password /account/password /signup /account/verify-email'
        )
        self.assertEqual(result, expected)
        self.assertEqual(result.split('www.hollowgate.quest {')[0],
                         FIXTURE.split('www.hollowgate.quest {')[0])
        self.assertEqual(result.split('hollowgate.quest {\n  redir')[1],
                         FIXTURE.split('hollowgate.quest {\n  redir')[1])

    def test_refuses_repeat(self):
        with self.assertRaises(ValueError):
            module.make_candidate(module.make_candidate(FIXTURE))

    def test_refuses_unknown_matcher_or_multiple_public_sites(self):
        with self.assertRaises(ValueError):
            module.make_candidate(FIXTURE.replace('@authPages path /login',
                                                  '@authPages path /other'))
        with self.assertRaises(ValueError):
            module.make_candidate(FIXTURE + FIXTURE)


if __name__ == '__main__':
    unittest.main()
