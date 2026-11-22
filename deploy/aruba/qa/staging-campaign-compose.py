"""Prepare/validate narrowly scoped staging overlays, with private root-only files.

No container mutation. Comparison requires the same effective environment,
runtime image, user, networks and secret bind mounts except five approved flags.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

SERVICE = 'aruba-auth-staging'
FLAGS = ['AUTH_VTT_'+part+'_ENABLED' for part in (
    'CAMPAIGN_INVITES', 'CAMPAIGN_ROSTER', 'CHARACTER_AVAILABILITY',
    'CHARACTER_ASSIGNMENTS', 'PLAYER_CHARACTERS')]


def env_dict(values):
    return dict(item.split('=', 1) for item in values if '=' in item)


def inspect(kind, target):
    result = subprocess.run(['docker', kind, 'inspect', target], check=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    items = json.loads(result.stdout)
    if len(items) != 1:
        raise ValueError('Expected one inspect result')
    return items[0]


def prepare(container, tag, work):
    if not re.fullmatch(r'hollowgate-staging-campaign-pin:[0-9]+', tag):
        raise ValueError('Invalid image pin tag')
    current = inspect('container', container)
    image = inspect('image', current['Image'])
    before = {'environment': env_dict(current['Config']['Env']),
              'imageEnvironment': env_dict(image['Config'].get('Env') or []),
              'imageId': current['Image'], 'user': current['Config']['User'],
              'networks': sorted(current['NetworkSettings']['Networks']),
              'secretMounts': {m['Destination']: m['Source'] for m in current['Mounts']
                               if m['Destination'].startswith('/run/secrets/')},
              'readOnly': current['HostConfig']['ReadonlyRootfs']}
    if before['environment'].get('PGDATABASE') != 'hollowgate_auth_test' or \
       before['environment'].get('PGUSER') != 'hollowgate_auth_staging_app':
        raise ValueError('Not isolated staging')
    for name, value in (('on', 'true'), ('off', None)):
        flags = {key: value if name == 'on' else before['environment'].get(key) for key in FLAGS}
        overlay = {'services': {SERVICE: {'image': tag, 'environment': flags}}}
        with (work/f'compose.campaign-{name}.json').open('x') as file:
            json.dump(overlay, file, indent=2)
    with (work/'runtime-before.private.json').open('x') as file:
        json.dump(before, file, indent=2)


def validate(before, config, mode, tag):
    if mode not in ('on', 'off') or config.get('name') != 'hollowgate-auth-staging':
        raise ValueError('Wrong project or mode')
    if set(config['services']) != {SERVICE}:
        raise ValueError('Unexpected Compose services')
    service = config['services'][SERVICE]
    if service['image'] != tag or str(service['user']) != before['user']:
        raise ValueError('Image/user changed')
    if bool(service.get('read_only', False)) != before['readOnly'] or service.get('privileged', False):
        raise ValueError('Runtime isolation changed')
    expected = dict(before['environment'])
    if mode == 'on':
        expected.update({flag: 'true' for flag in FLAGS})
    effective = dict(before['imageEnvironment'])
    for key, value in service.get('environment', {}).items():
        if value is None:
            effective.pop(key, None)
        else:
            effective[key] = str(value)
    if effective != expected:
        # Never print environment values, even on failure.
        changed = sorted(key for key in set(effective) | set(expected)
                         if effective.get(key) != expected.get(key)
                         and re.fullmatch(r'[A-Z0-9_]{1,100}', key))
        raise ValueError('Unexpected effective environment keys: '+', '.join(changed))
    actual_networks = sorted(config['networks'][key]['name'] for key in service['networks'])
    if actual_networks != before['networks']:
        raise ValueError('Network change')
    mounts = {}
    for secret in service.get('secrets', []):
        source = secret if isinstance(secret, str) else secret['source']
        target = source if isinstance(secret, str) else secret.get('target', source)
        if not target.startswith('/'):
            target = '/run/secrets/'+target
        mounts[target] = config['secrets'][source]['file']
    if mounts != before['secretMounts']:
        raise ValueError('Secret source/target change')


if __name__ == '__main__':
    try:
        action, *args = sys.argv[1:]
        if action == 'prepare' and len(args) == 3:
            prepare(args[0], args[1], Path(args[2]))
        elif action == 'validate' and len(args) == 4:
            before, config, mode, tag = args
            validate(json.loads(Path(before).read_text()), json.loads(Path(config).read_text()), mode, tag)
        else:
            raise ValueError('Invalid arguments')
    except Exception as error:
        reason = str(error) if type(error) is ValueError else 'inspect inputs privately'
        print('STAGING_COMPOSE_CHECK_FAILED: '+reason+'; no environment values printed', file=sys.stderr)
        raise SystemExit(1)
