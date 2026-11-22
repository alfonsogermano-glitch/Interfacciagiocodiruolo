"""Real Caddy validate/reload/rollback on ephemeral loopback ports, NON-root.

Uses public-site routing from a read-only live COPY, with all roots and API
targets replaced by private QA fixtures. Never controls Docker or a live admin
endpoint. Requires a separately checksum-verified official Caddy binary.
"""
import hashlib
import importlib.util
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    if os.name != 'posix' or os.geteuid() == 0:
        raise RuntimeError('Non-root Linux QA only; never run with sudo')
    if len(sys.argv) != 4 or not re.fullmatch('[a-f0-9]{64}', sys.argv[3]):
        raise RuntimeError('Expected QA directory, legal inputs directory, pinned manifest hash')
    qa, inputs = map(lambda value: Path(value).resolve(), sys.argv[1:3])
    home = Path.home().resolve()
    if qa != home/'hg-public-legal-caddy-qa-20261122' or inputs != home/'hg-public-legal-20261122':
        raise RuntimeError('QA/input directories must be the dedicated operator-owned home paths')
    binary = qa/'caddy'
    if not binary.is_file() or binary.is_symlink():
        raise RuntimeError('Verified standalone Caddy binary missing')
    sums = (inputs/'SHA256SUMS').read_bytes()
    if digest(sums) != sys.argv[3]:
        raise RuntimeError('Input manifest mismatch')
    names = set()
    for line in sums.decode('ascii').splitlines():
        sha, name = line.split('  ', 1)
        if not re.fullmatch('[a-f0-9]{64}', sha) or '/' in name or '\\' in name or name in names:
            raise RuntimeError('Unexpected manifest entries')
        names.add(name)
        path = inputs/name
        if path.is_symlink() or digest(path.read_bytes()) != sha:
            raise RuntimeError('Input content mismatch')
    if names != {'privacy.html','elimina-dati.html','manifest.json','prepare-public-legal-routes.py'}:
        raise RuntimeError('Unexpected input set')
    work = qa/'rehearsal'
    work.mkdir(mode=0o700)  # Exclusive: preserve any previous attempted QA.
    spec = importlib.util.spec_from_file_location('legal_routes', inputs/'prepare-public-legal-routes.py')
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    live = Path('/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial')
    before_bytes = live.read_bytes()
    if digest(before_bytes) != '05b06f6da2b655f5c3248cbd54fee0cd3f9a2ce06259766502bbce40b757603b':
        raise RuntimeError('Live source changed; stop instead of rehearsing stale input')
    before = before_bytes.decode('utf-8')
    after = generator.candidate(before)
    if after.replace(generator.BLOCK, '', 1) != before:
        raise RuntimeError('Candidate changes more than the additive legal block')
    web, auth = work/'web', work/'auth'
    (web/'site-pages').mkdir(parents=True)
    auth.mkdir()
    for name in ('privacy.html','elimina-dati.html'):
        (web/'site-pages'/name).write_bytes((inputs/name).read_bytes())
    (web/'index.html').write_bytes(b'qa-vtt-unchanged')
    (auth/'index.trial.html').write_bytes(b'qa-auth-unchanged')

    # Reserve distinct ephemeral ports, then release just before Caddy binds.
    http_socket, admin_socket = socket.socket(), socket.socket()
    try:
        http_socket.bind(('127.0.0.1', 0))
        admin_socket.bind(('127.0.0.1', 0))
        http_port, admin_port = http_socket.getsockname()[1], admin_socket.getsockname()[1]
    finally:
        http_socket.close()
        admin_socket.close()

    def qa_config(shared):
        matches = list(re.finditer(r'^www\.hollowgate\.quest \{\n.*?^\}', shared, re.M | re.S))
        if len(matches) != 1:
            raise RuntimeError('Missing unique public site')
        public = matches[0].group().replace('www.hollowgate.quest {', f'http://127.0.0.1:{http_port} {{', 1)
        public = public.replace('root * /srv/vtt-pilot/site-pages', f'root * "{web}/site-pages"')
        public = public.replace('root * /srv/vtt-pilot', f'root * "{web}"')
        public = public.replace('root * /srv/auth-preview', f'root * "{auth}"')
        public = public.replace('reverse_proxy hollowgate-production-api:3000', 'respond "qa-api-unchanged" 418')
        if 'reverse_proxy' in public or '/srv/' in public or 'import ' in public:
            raise RuntimeError('Unexpected external/protected dependency in isolated QA configuration')
        return '{\n  admin 127.0.0.1:'+str(admin_port)+'\n  auto_https off\n  persist_config off\n}\n\n'+public+'\n'

    old_file, new_file = work/'Caddyfile.before', work/'Caddyfile.candidate'
    old_file.write_text(qa_config(before))
    new_file.write_text(qa_config(after))
    env = {**os.environ, 'XDG_DATA_HOME':str(work/'data'), 'XDG_CONFIG_HOME':str(work/'config')}
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def get(path, method='GET'):
        request = urllib.request.Request(f'http://127.0.0.1:{http_port}'+path, method=method)
        try:
            with opener.open(request, timeout=2) as response:
                return response.status, response.read(), response.headers.get('Content-Type', '')
        except urllib.error.HTTPError as error:
            return error.code, error.read(), error.headers.get('Content-Type', '')

    with (work/'caddy.private.log').open('wb') as log:
        def command(*args):
            subprocess.run([str(binary), *map(str,args)], env=env, stdout=log, stderr=log, check=True, timeout=20)
        command('validate','--config',old_file,'--adapter','caddyfile')
        command('validate','--config',new_file,'--adapter','caddyfile')
        process = subprocess.Popen([str(binary),'run','--config',str(old_file),'--adapter','caddyfile'], env=env, stdout=log, stderr=log)
        try:
            deadline = time.monotonic()+10
            while True:
                if process.poll() is not None:
                    raise RuntimeError('Disposable Caddy exited; inspect private QA log')
                try:
                    if get('/ready')[:2] == (418,b'qa-api-unchanged'):
                        break
                except OSError:
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError('Disposable Caddy startup timeout')
                time.sleep(0.05)  # Bounded local server readiness, not tool-job polling.
            baseline = {path:get(path)[:2] for path in ('/login','/signup','/vtt/','/ready')}
            if baseline != {'/login':(200,b'qa-auth-unchanged'),'/signup':(200,b'qa-auth-unchanged'),
                            '/vtt/':(200,b'qa-vtt-unchanged'),'/ready':(418,b'qa-api-unchanged')}:
                raise RuntimeError('Unexpected original routing in QA')
            if any(get(path)[0] != 404 for path in ('/privacy','/elimina-dati')):
                raise RuntimeError('Legal routes unexpectedly present before reload')
            print('PUBLIC_LEGAL_REAL_CADDY_BASELINE_OK', flush=True)
            command('reload','--address',f'127.0.0.1:{admin_port}','--config',new_file,'--adapter','caddyfile')
            for path in ('/privacy','/elimina-dati'):
                status, body, mime = get(path+'?qa=1')
                if status != 200 or not mime.startswith('text/html') or body != (inputs/(path[1:]+'.html')).read_bytes():
                    raise RuntimeError('Real Caddy served wrong legal page bytes/type/status')
                if get(path, 'HEAD')[0] != 200:
                    raise RuntimeError('Legal HEAD failed')
            if {path:get(path)[:2] for path in baseline} != baseline:
                raise RuntimeError('Other public routes changed in QA')
            print('PUBLIC_LEGAL_REAL_CADDY_RELOAD_AND_HASHES_OK', flush=True)
            command('reload','--address',f'127.0.0.1:{admin_port}','--config',old_file,'--adapter','caddyfile')
            if any(get(path)[0] != 404 for path in ('/privacy','/elimina-dati')):
                raise RuntimeError('Old routing not restored in QA')
            if {path:get(path)[:2] for path in baseline} != baseline:
                raise RuntimeError('Rollback changed old routes in QA')
            if live.read_bytes() != before_bytes:
                raise RuntimeError('Live Caddy source changed independently')
            print('PUBLIC_LEGAL_REAL_CADDY_ROLLBACK_OK — disposable loopback only; active services untouched', flush=True)
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == '__main__':
    main()
