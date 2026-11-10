#!/usr/bin/env python3
"""Read-only Supabase Storage export for an isolated STAGING project."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import urllib.parse
import urllib.request

PAGE_SIZE = 100


def safe_name(name):
    if not isinstance(name, str) or not name or name in ('.', '..') or '/' in name or '\\' in name or '\x00' in name:
        raise ValueError('Unsafe Storage path component')
    return name


def request(url, token, payload=None):
    headers = {'apikey': token, 'Authorization': 'Bearer ' + token}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=json.dumps(payload).encode() if payload is not None else None,
                                 headers=headers, method='POST' if payload is not None else 'GET')
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def list_objects(base, token, bucket, prefix=''):
    offset = 0
    while True:
        url = base + '/storage/v1/object/list/' + urllib.parse.quote(bucket, safe='')
        items = json.loads(request(url, token, {'prefix': prefix, 'limit': PAGE_SIZE, 'offset': offset, 'sortBy': {'column': 'name', 'order': 'asc'}}))
        if not isinstance(items, list):
            raise ValueError('Unexpected Storage list response')
        for item in items:
            name = safe_name(item['name'])
            key = prefix + name
            if item.get('id') is None:
                yield from list_objects(base, token, bucket, key + '/')
            else:
                yield key, item
        if len(items) < PAGE_SIZE:
            break
        offset += len(items)


def export(base, token, dest, buckets):
    if dest.exists() and any(dest.iterdir()):
        raise ValueError('Destination directory must be empty')
    dest.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(dest, 0o700)
    manifest = {'format': 1, 'source': 'staging', 'objects': []}
    for bucket in buckets:
        safe_name(bucket)
        for key, metadata in list_objects(base, token, bucket):
            parts = [safe_name(p) for p in PurePosixPath(key).parts]
            target = dest.joinpath('objects', bucket, *parts)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if target.is_symlink() or target.exists():
                raise ValueError('Existing or unsafe destination')
            encoded = '/'.join(urllib.parse.quote(p, safe='') for p in [bucket, *parts])
            raw = request(base + '/storage/v1/object/authenticated/' + encoded, token)
            with target.open('xb') as f:
                f.write(raw)
            os.chmod(target, 0o600)
            manifest['objects'].append({'bucket': bucket, 'key': key, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'source_metadata': metadata})
    manifest['objects'].sort(key=lambda x: (x['bucket'], x['key']))
    (dest / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    os.chmod(dest / 'manifest.json', 0o600)
    verify(dest)
    return len(manifest['objects'])


def verify(dest):
    manifest = json.loads((dest / 'manifest.json').read_text(encoding='utf-8'))
    seen = set()
    for obj in manifest['objects']:
        bucket = safe_name(obj['bucket'])
        parts = [safe_name(p) for p in PurePosixPath(obj['key']).parts]
        key = (bucket, *parts)
        if key in seen:
            raise ValueError('Duplicate object in manifest')
        seen.add(key)
        path = dest.joinpath('objects', *key)
        if path.is_symlink() or not path.is_file():
            raise ValueError('Missing or symlinked object')
        data = path.read_bytes()
        if len(data) != obj['bytes'] or hashlib.sha256(data).hexdigest() != obj['sha256']:
            raise ValueError('Storage object checksum mismatch')
    return len(seen)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == 'verify':
        print('Verified objects:', verify(Path(sys.argv[2]).resolve()))
        return
    if len(sys.argv) != 3 or sys.argv[1] != 'export':
        raise SystemExit('Usage: backup-staging-storage.py export ABSOLUTE_EMPTY_DIRECTORY | verify DIRECTORY')
    if os.environ.get('BACKUP_SOURCE') != 'staging':
        raise SystemExit('REFUSED: BACKUP_SOURCE=staging required')
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    token = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    buckets = [b.strip() for b in os.environ.get('STAGING_BUCKETS', '').split(',') if b.strip()]
    dest = Path(sys.argv[2])
    if not dest.is_absolute() or not url.startswith('https://') or not token or not buckets:
        raise SystemExit('REFUSED: absolute directory, HTTPS SUPABASE_URL, service role key and STAGING_BUCKETS required')
    expected = os.environ.get('STAGING_PROJECT_REF', '')
    host = urllib.parse.urlsplit(url).hostname or ''
    if not expected or expected == 'njcnkovruynhtsgzgrxi' or host != expected + '.supabase.co':
        raise SystemExit('REFUSED: STAGING_PROJECT_REF must match an isolated non-production Supabase project')
    print('Exported and verified objects:', export(url, token, dest, buckets))


if __name__ == '__main__':
    main()
