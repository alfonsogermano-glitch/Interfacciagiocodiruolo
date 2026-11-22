"""Generate one matcher-only patch for the isolated STAGING Caddyfile.

Never edits the input and refuses shared public sites or already changed files.
"""
import re
import sys
from pathlib import Path

OLD = '@vttAPI path /vtt/bootstrap /vtt/campaigns /vtt/campaigns/* /vtt/characters /vtt/characters/*'
ADDED = (
    '/vtt/campaign-invites/preview', '/vtt/campaign-invites/join',
    '/vtt/player-campaigns', '/vtt/player-characters', '/vtt/player-characters/*',
    '/vtt/character-availability', '/vtt/character-availability/*',
    '/vtt/character-assignments', '/vtt/character-assignments/*',
)


def candidate(source):
    if 'www.hollowgate.quest' in source or re.search(r'^hollowgate\.quest\s*\{', source, re.M):
        raise ValueError('Refusing shared public gateway configuration')
    if len(re.findall(r'^staging\.hollowgate\.quest\s*\{', source, re.M)) != 1:
        raise ValueError('Expected exactly one staging site')
    if 'basic_auth @private' not in source or 'not path /health /ready' not in source:
        raise ValueError('Private staging gate missing')
    pattern = r'^([ \t]*)'+re.escape(OLD)+r'[ \t]*$'
    if len(re.findall(pattern, source, re.M)) != 1:
        raise ValueError('Unexpected or already patched VTT matcher')
    return re.sub(pattern, lambda m: m.group(1)+OLD+' '+' '.join(ADDED), source, count=1, flags=re.M)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare-staging-campaign-routes.py LIVE_COPY NEW_CANDIDATE')
    old, new = map(Path, sys.argv[1:])
    if new.exists() or new.is_symlink() or old.resolve() == new.resolve():
        raise SystemExit('Candidate output must not exist or replace input')
    raw = old.read_bytes()
    if b'\r' in raw:
        raise SystemExit('Unexpected line endings')
    with new.open('xb') as output:
        output.write(candidate(raw.decode('utf-8')).encode('utf-8'))
