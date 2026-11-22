"""Add public legal routes to a COPY of the current shared live gateway.

No deployment; never substitute the staging-only local Caddyfile for live.
"""
import re
import sys
from pathlib import Path

BLOCK = '''  # Static render of the original legal pages; no auth or API dependency.
  @publicLegalPages path /privacy /elimina-dati
  handle @publicLegalPages {
    header Cache-Control "no-transform"
    root * /srv/vtt-pilot/site-pages
    rewrite * {path}.html
    file_server
  }

'''
ANCHOR = '  @frontendEntry path /vtt /vtt/\n'


def candidate(source):
    sites = list(re.finditer(r'^www\.hollowgate\.quest \{\n.*?^\}', source, re.M | re.S))
    if len(sites) != 1:
        raise ValueError('Expected exactly one explicit public www site')
    site = sites[0]
    public = site.group()
    if '@publicLegalPages' in source or '/privacy' in public or '/elimina-dati' in public:
        raise ValueError('Unexpected or already installed legal routes')
    if public.count(ANCHOR) != 1 or 'reverse_proxy hollowgate-production-api:3000' not in public:
        raise ValueError('Unexpected live public layout; do not use historical cutover config')
    updated = public.replace(ANCHOR, BLOCK + ANCHOR, 1)
    return source[:site.start()] + updated + source[site.end():]


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare-public-legal-routes.py LIVE_COPY NEW_CANDIDATE')
    old, new = map(Path, sys.argv[1:])
    if old.resolve() == new.resolve() or new.exists() or new.is_symlink():
        raise SystemExit('Output must be a new candidate, never the live file')
    raw = old.read_bytes()
    if b'\r' in raw:
        raise SystemExit('Unexpected live line endings')
    with new.open('xb') as output:
        output.write(candidate(raw.decode('utf-8')).encode('utf-8'))
