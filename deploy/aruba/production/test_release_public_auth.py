"""Run the real shell control flow against isolated files + Docker/HTTP mocks.

No live connections, secrets, sudo or containers. This is NOT a Docker/Caddy
end-to-end rehearsal. Inject failures after the API switch and after the
bind-mounted Caddyfile write to verify restoration and nonzero exit status.
"""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).parent
BASH = shutil.which('bash') if os.name != 'nt' else r'C:\Program Files\Git\bin\bash.exe'


def shell_path(path):
    text = str(path.resolve()).replace('\\', '/')
    return '/' + text[0].lower() + text[2:] if os.name == 'nt' else text


MOCK = r'''
docker() {
  if [[ $1 == compose && " $* " == *" config "* ]]; then
    if [[ " $* " == *" --quiet "* ]]; then return 0; fi
    echo '{"services":{"aruba-api":{"environment":{"AUTH_SIGNUP_ENABLED":"false","AUTH_OAUTH_ENABLED":"false"},"networks":{"hollowgate-db":{},"public-gateway":{"aliases":["hollowgate-production-api"]}}}}}'
  elif [[ $1 == compose && " $* " == *" up "* ]]; then
    if [[ " $* " == *compose.auth-public-off.yaml* ]]; then echo off > "$QA/flags"
    else
      echo on > "$QA/flags"
      if [[ $SCENARIO == compose-fail ]]; then return 1; fi
    fi
  elif [[ $1 == inspect && "$*" == *NetworkSettings.Networks* ]]; then
    echo '{"hollowgate-db":{},"hollowgate-auth-staging_default":{"Aliases":["hollowgate-production-api"]}}'
  elif [[ $1 == inspect ]]; then
    echo sha256:qa
  elif [[ $1 == exec && " $* " == *" caddy validate "* ]]; then
    if [[ $SCENARIO == caddy-fail && $(cat "$QA/live/Caddyfile") == new-caddy ]]; then return 1; fi
  elif [[ $1 == exec && " $* " == *" caddy reload "* ]]; then
    echo reload >> "$QA/reloads"
  elif [[ $1 == exec && " $* " == *" wget "* ]]; then
    if [[ $SCENARIO == slow-start && ! -e $QA/waited ]]; then touch "$QA/waited"; return 1; fi
  else
    return 0
  fi
}
curl() {
  if [[ " $* " == *auth/oauth/providers* ]]; then
    if [[ $(cat "$QA/flags") == off ]]; then echo '{"providers":[]}'
    else echo '{"providers":["google","discord"]}'; fi
  elif [[ " $* " == *quest/signup* || " $* " == *quest/account/verify-email* ]]; then
    if [[ $(cat "$QA/live/Caddyfile") == new-caddy ]]; then
      if [[ $SCENARIO == public-fail ]]; then echo 502; else echo 200; fi
    else echo 404; fi
  else echo 200; fi
}
sleep() { :; }
'''


class ReleaseFlowTests(unittest.TestCase):
    def run_case(self, scenario):
        with tempfile.TemporaryDirectory(prefix='hg-auth-release-') as directory:
            root = Path(directory)
            bundle = root / 'bundles' / 'auth-public-20261121'
            live = root / 'live'
            (bundle / 'auth-web').mkdir(parents=True)
            (live / 'auth-web').mkdir(parents=True)
            (root / 'rollback').mkdir()
            (root / 'flags').write_text('off\n')
            for name in ('index.trial.html', 'app.mjs', 'flow.mjs', 'styles.css'):
                (bundle / 'auth-web' / name).write_text('new-' + name)
                (live / 'auth-web' / name).write_text('old-' + name)
            (bundle / 'Caddyfile.candidate').write_text('new-caddy')
            (live / 'Caddyfile').write_text('old-caddy')
            for name in ('compose.core-release.yaml', 'compose.auth-public.yaml', 'compose.auth-public-off.yaml'):
                (bundle / name).write_text('# mock input')
            preflight = root / 'preflight.sh'
            preflight.write_text('#!/usr/bin/env bash\n' +
                                 ('exit 1\n' if scenario == 'preflight-fail' else 'echo AUTH_PREFLIGHT_OK\n'))
            preflight.chmod(0o700)
            source = (HERE / 'release-public-auth.sh').read_text(encoding='utf-8')
            # Only adapt root/installation guards and paths for non-root tests.
            source = source.replace("(( EUID == 0 )) || die 'run with sudo only after explicit approval'", ': # isolated test user')
            source = source.replace(' && $(stat -c %u "$preflight") == 0', '')
            replacements = {
                '/opt/hollowgate-auth-bundles': shell_path(root / 'bundles'),
                '/opt/hollowgate-auth-rollback': shell_path(root / 'rollback'),
                '/opt/hollowgate/aruba-source/apps/aruba-auth-web': shell_path(live / 'auth-web'),
                '/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial': shell_path(live / 'Caddyfile'),
                '/opt/hollowgate-preflight-public-auth-20261121.sh': shell_path(preflight),
            }
            for old, new in replacements.items():
                source = source.replace(old, new)
            script = root / 'release.sh'
            script.write_text(source, encoding='utf-8', newline='\n')
            mock = root / 'mock.sh'
            mock.write_text(MOCK, encoding='utf-8', newline='\n')
            env = {**os.environ, 'QA': shell_path(root), 'SCENARIO': scenario,
                   'BASH_ENV': shell_path(mock)}
            result = subprocess.run([BASH, shell_path(script), 'auth-public-20261121', 'a' * 64],
                                    env=env, capture_output=True, text=True, timeout=20)
            output = result.stdout + result.stderr
            success = scenario in ('success', 'slow-start')
            self.assertEqual(result.returncode == 0, success, output)
            self.assertEqual((root / 'flags').read_text().strip(), 'on' if success else 'off', output)
            self.assertEqual((live / 'Caddyfile').read_text(), 'new-caddy' if success else 'old-caddy', output)
            for name in ('index.trial.html', 'app.mjs', 'flow.mjs', 'styles.css'):
                self.assertEqual((live / 'auth-web' / name).read_text(),
                                 ('new-' if success else 'old-') + name, output)
            expected = 'AUTH_RELEASE_OK' if success else ('AUTH_RELEASE_STOP' if scenario == 'preflight-fail' else 'AUTH_ROLLBACK_OK')
            self.assertIn(expected, output)

    def test_success(self): self.run_case('success')
    def test_slow_start(self): self.run_case('slow-start')
    def test_preflight_stops_before_mutation(self): self.run_case('preflight-fail')
    def test_compose_failure_closes_flags(self): self.run_case('compose-fail')
    def test_caddy_failure_restores_bind_file_and_assets(self): self.run_case('caddy-fail')
    def test_public_failure_restores_everything(self): self.run_case('public-fail')


if __name__ == '__main__':
    unittest.main()
