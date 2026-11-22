"""Assemble the eight reviewed migrations, never execute them.

The caller must run the result with psql --single-transaction. Comments before
BEGIN are permitted; duplicate, missing or unexpected transaction wrappers are
rejected. No role provisioning or staging guard from 037 is changed.
"""
import re
import sys
from pathlib import Path

FILES = (
    '015_vtt_campaign_notes.sql', '016_vtt_campaign_members.sql',
    '026_vtt_campaign_roster.sql', '027_vtt_character_availability.sql',
    '028_vtt_character_player_assignments.sql', '029_vtt_player_character_read.sql',
    '030_vtt_joined_player_campaigns.sql', '033_vtt_campaign_invites.sql',
)


def unwrap(source: str) -> str:
    if source.count('\x00'):
        raise ValueError('NUL in SQL source')
    source = source.replace('\r\n', '\n')
    statements = [line.strip() for line in source.splitlines()
                  if line.strip() and not line.lstrip().startswith('--')]
    if not statements or statements[0] != 'BEGIN;' or statements[-1] != 'COMMIT;':
        raise ValueError('Unexpected transaction boundaries')
    if len(re.findall(r'^BEGIN;$', source, re.M)) != 1 or len(re.findall(r'^COMMIT;$', source, re.M)) != 1:
        raise ValueError('Duplicate or missing transaction wrapper')
    if re.search(r'^\s*(?:ROLLBACK|START\s+TRANSACTION)\b', source, re.M | re.I):
        raise ValueError('Unexpected transaction statement')
    return re.sub(r'^(?:BEGIN;|COMMIT;)\n?', '', source, flags=re.M)


def assemble(directory: Path) -> str:
    return '\n'.join('-- SOURCE: '+name+'\n'+unwrap((directory/name).read_text(encoding='utf-8'))
                     for name in FILES)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: assemble-staging-campaign-sql.py REVIEWED_BUNDLE')
    sys.stdout.write(assemble(Path(sys.argv[1])))
