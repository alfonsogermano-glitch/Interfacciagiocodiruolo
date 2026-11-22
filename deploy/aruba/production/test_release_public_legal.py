"""Exercise the real legal-only release flow with disposable files and mocks.

No live services, sudo or production credentials. This is control-flow QA,
not a substitute for Caddy validation inside the actual gateway at preflight.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).parent
QA = HERE.parent/'qa'
BASH = shutil.which('bash') if os.name != 'nt' else r'C:\Program Files\Git\bin\bash.exe'
spec = importlib.util.spec_from_file_location('legal_fixture', QA/'test_prepare_public_legal_routes.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


def shell_path(path):
    text = str(path.resolve()).replace('\\', '/')
    return '/' + text[0].lower() + text[2:] if os.name == 'nt' else text


MOCK = r'''
python3(){ "$QA_PYTHON" "$@"; }
qa_page_permissions(){
  [[ $SCENARIO != permission-fail ]] || return 1
  if [[ $QA_WINDOWS != 1 ]]; then command chmod 755 "$QA/live/web/site-pages"; fi
}
docker(){
  if [[ $1 == inspect && "$*" == *'json .Mounts'* ]]; then
    cat "$QA/mounts.json"
  elif [[ $1 == ps ]]; then
    printf '%s\n' qa-gateway qa-api qa-db qa-staging
  elif [[ $1 == inspect && "$*" == *'.State.StartedAt'* ]]; then
    for name in qa-api qa-db qa-gateway qa-staging; do
      if [[ $SCENARIO == container-drift && -e $QA/reloaded && $name == qa-api ]]; then
        echo "$name|sha256:changed|new-start|true"
      else echo "$name|sha256:unchanged|old-start|true"; fi
    done
  elif [[ $1 == exec && " $* " == *' caddy validate '* ]]; then
    if [[ " $* " == *' /dev/stdin '* ]]; then
      cat > "$QA/validated"
      [[ $SCENARIO != candidate-invalid ]] || return 1
    fi
  elif [[ $1 == exec && " $* " == *' caddy reload '* ]]; then
    echo reload >> "$QA/reloads"
    if grep -q '@publicLegalPages' "$QA/live/Caddyfile"; then
      [[ $SCENARIO != reload-fail ]] || return 1
      if [[ $SCENARIO == interrupted-reload ]]; then kill -TERM $$; return 1; fi
      touch "$QA/reloaded"
      if [[ $SCENARIO == stage-drift ]]; then echo external-stage-change > "$QA/live/isolated"; fi
      if [[ $SCENARIO == caddy-drift ]]; then echo external-caddy-change >> "$QA/live/Caddyfile"; fi
    elif [[ $SCENARIO == rollback-fail ]]; then return 1; fi
  elif [[ $1 == exec && " $* " == *' test -r '* ]]; then
    [[ $SCENARIO != bind-unreadable ]] || return 1
    test -r "$QA/live/web/site-pages/${!#}"
  else echo "UNEXPECTED_DOCKER_CALL" >&2; return 1; fi
}
curl(){
  local url=${!#}
  if [[ $url == *'/privacy?legal-release='* || $url == *'/elimina-dati?legal-release='* ]]; then
    [[ $SCENARIO != https-fail && $SCENARIO != rollback-fail ]] || return 22
    if [[ $SCENARIO == body-mismatch ]]; then echo wrong-body; return; fi
    if [[ $url == *'/privacy?'* ]]; then cat "$QA/live/web/site-pages/privacy.html"
    else cat "$QA/live/web/site-pages/elimina-dati.html"; fi
  elif [[ $SCENARIO == baseline-fail ]]; then echo 502
  elif [[ $SCENARIO == post-baseline-fail && -e $QA/reloaded ]]; then echo 502
  else echo 200; fi
}
'''
# The last test -r argument is the container path; only its basename maps to
# the fixture. No shell command ever targets real container/filesystem paths.
MOCK = MOCK.replace('site-pages/${!#}', 'site-pages/$(basename "${!#}")')


class PublicLegalReleaseTests(unittest.TestCase):
    def run_case(self, scenario):
        base = Path(os.environ['LOCALAPPDATA'])/'Temp/opencode' if os.name == 'nt' else None
        with tempfile.TemporaryDirectory(prefix='hg-legal-release-', dir=base) as directory:
            root = Path(directory)
            live = root/'live'
            web = live/'web'
            inputs = root/'inputs'
            work = root/'work'
            web.mkdir(parents=True)
            inputs.mkdir()
            (web/'index.html').write_text('original-vtt')
            (web/'historical-media.bin').write_bytes(b'original-media')
            if scenario == 'existing-pages':
                (web/'site-pages').mkdir()
                (web/'site-pages/keep.txt').write_text('existing-user-content')
            (live/'Caddyfile').write_text(fixture.BEFORE, encoding='utf-8', newline='\n')
            (live/'isolated').write_text('original-isolated')
            inode = (live/'Caddyfile').stat().st_ino
            pages = []
            for route in ('privacy', 'elimina-dati'):
                data = ('<!doctype html><html lang="it"><h1 style="color:white">'+route+'</h1></html>\n').encode()
                (inputs/(route+'.html')).write_bytes(data)
                pages.append({'path':'/'+route, 'file':route+'.html', 'sha256':hashlib.sha256(data).hexdigest()})
            (inputs/'manifest.json').write_text(json.dumps({'schemaVersion':1, 'pages':pages}))
            shutil.copyfile(QA/'prepare-public-legal-routes.py', inputs/'prepare-public-legal-routes.py')
            names = ['manifest.json', 'privacy.html', 'elimina-dati.html', 'prepare-public-legal-routes.py']
            sums = ''.join(hashlib.sha256((inputs/name).read_bytes()).hexdigest()+'  '+name+'\n' for name in names)
            (inputs/'SHA256SUMS').write_text(sums, encoding='ascii', newline='\n')
            pinned = hashlib.sha256((inputs/'SHA256SUMS').read_bytes()).hexdigest()
            if scenario == 'input-tampered': (inputs/'privacy.html').write_text('tampered')
            mounts = [
                {'Destination':'/etc/caddy/Caddyfile','Source':(live/'Caddyfile').as_posix(),'Type':'bind','RW':False},
                {'Destination':'/srv/vtt-pilot','Source':web.as_posix(),'Type':'bind','RW':False},
            ]
            if scenario == 'wrong-bind': mounts[1]['Source'] = '/wrong/staging-web'
            (root/'mounts.json').write_text(json.dumps(mounts))
            source = (HERE/'release-public-legal.sh').read_text(encoding='utf-8')
            # Adapt only privilege/ownership and installation paths in this
            # disposable test copy. The production runner has NO QA bypass.
            source = source.replace("(( EUID == 0 )) || die 'approved sudo session required'", ': # non-root isolated test')
            source = source.replace('install -o root -g root -m', 'install -m')
            source = source.replace('chmod 755 "$web/site-pages"', 'qa_page_permissions')
            if os.name == 'nt':
                # Git Bash cannot grant Unix world-read ACLs in this sandbox.
                # Actual Caddy readability remains a mandatory deployment gate.
                source = source.replace('install -m 644', 'install -m 600')
            replacements = {
                '/home/hgadmin/hg-public-legal-20261122': shell_path(inputs),
                '/opt/hollowgate-public-legal-20261122': shell_path(work),
                '/opt/hollowgate/aruba-source/deploy/aruba/dist/vtt-pilot': shell_path(web),
                '/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial': shell_path(live/'Caddyfile'),
                '/opt/hollowgate/staging-trial/Caddyfile.staging-isolated': shell_path(live/'isolated'),
                '05b06f6da2b655f5c3248cbd54fee0cd3f9a2ce06259766502bbce40b757603b': hashlib.sha256(fixture.BEFORE.encode()).hexdigest(),
                'b5ac1260525018dd32044fafc7560fb9406f518dbdb2f1cf897f449f81d99d11': hashlib.sha256(fixture.module.candidate(fixture.BEFORE).encode()).hexdigest(),
            }
            for old, new in replacements.items():
                self.assertEqual(source.count(old), 1, old)
                source = source.replace(old, new)
            (root/'runner.sh').write_text(source, encoding='utf-8', newline='\n')
            (root/'mock.sh').write_text(MOCK, encoding='utf-8', newline='\n')
            env = {**os.environ, 'QA':shell_path(root), 'SCENARIO':scenario,
                   'QA_WINDOWS':'1' if os.name == 'nt' else '0',
                   'QA_PYTHON':shell_path(Path(sys.executable)), 'BASH_ENV':shell_path(root/'mock.sh')}
            result = subprocess.run([BASH, shell_path(root/'runner.sh'), pinned], env=env,
                                    capture_output=True, text=True, timeout=25)
            output = result.stdout+result.stderr
            success = scenario == 'success'
            self.assertEqual(result.returncode == 0, success, output)
            expected = fixture.module.candidate(fixture.BEFORE) if success else fixture.BEFORE
            if scenario == 'caddy-drift': expected = fixture.module.candidate(fixture.BEFORE)+'external-caddy-change\n'
            self.assertEqual((live/'Caddyfile').read_text(), expected, output)
            self.assertEqual((live/'Caddyfile').stat().st_ino, inode, output)
            self.assertEqual((web/'index.html').read_text(), 'original-vtt', output)
            self.assertEqual((web/'historical-media.bin').read_bytes(), b'original-media', output)
            self.assertEqual((live/'isolated').read_text(), 'external-stage-change\n' if scenario == 'stage-drift' else 'original-isolated', output)
            self.assertEqual((web/'site-pages').exists(), success or scenario in ('rollback-fail','existing-pages','caddy-drift'), output)
            if scenario == 'existing-pages':
                self.assertEqual((web/'site-pages/keep.txt').read_text(),'existing-user-content')
                self.assertFalse(work.exists(), output)
            self.assertNotIn('UNEXPECTED_DOCKER_CALL', output)
            if success: self.assertIn('PUBLIC_LEGAL_RELEASE_OK', output)
            elif scenario in ('rollback-fail','caddy-drift'): self.assertIn('PUBLIC_LEGAL_ROLLBACK_INCOMPLETE', output)
            elif scenario == 'existing-pages': self.assertIn('never overwrite it', output)
            elif scenario in ('input-tampered','wrong-bind','baseline-fail','candidate-invalid'):
                self.assertNotIn('PUBLIC_LEGAL_CADDY_RELOADED', output)
                self.assertFalse((web/'site-pages').exists())
            else: self.assertIn('PUBLIC_LEGAL_ROLLBACK_OK', output)

    def test_success(self): self.run_case('success')
    def test_existing_pages_are_never_overwritten(self): self.run_case('existing-pages')
    def test_tampered_input_stops_before_changes(self): self.run_case('input-tampered')
    def test_wrong_public_bind_is_rejected(self): self.run_case('wrong-bind')
    def test_unhealthy_baseline_stops_before_changes(self): self.run_case('baseline-fail')
    def test_real_candidate_validation_gate_stops_before_changes(self): self.run_case('candidate-invalid')
    def test_unreadable_bind_restores_only_new_pages(self): self.run_case('bind-unreadable')
    def test_permission_failure_after_mkdir_rolls_back_new_directory(self): self.run_case('permission-fail')
    def test_reload_failure_restores_old_config_and_preserves_inode(self): self.run_case('reload-fail')
    def test_interrupted_reload_rolls_back(self): self.run_case('interrupted-reload')
    def test_failed_https_restores_old_routing(self): self.run_case('https-fail')
    def test_wrong_https_body_is_not_a_success(self): self.run_case('body-mismatch')
    def test_post_reload_baseline_failure_rolls_back(self): self.run_case('post-baseline-fail')
    def test_container_drift_rolls_back(self): self.run_case('container-drift')
    def test_independent_staging_change_is_never_overwritten(self): self.run_case('stage-drift')
    def test_independent_caddy_change_is_never_overwritten(self): self.run_case('caddy-drift')
    def test_rollback_failure_is_explicit_and_retains_potentially_served_pages(self): self.run_case('rollback-fail')


if __name__ == '__main__':
    unittest.main()
