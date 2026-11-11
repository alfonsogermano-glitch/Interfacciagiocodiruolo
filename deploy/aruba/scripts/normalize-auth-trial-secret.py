#!/usr/bin/env python3
"""Convert a legacy hash-only secret to the Caddy import format, atomically."""
import os
import re
import sys
import tempfile
from pathlib import Path

def normalize(path):
    path = Path(path)
    raw = path.read_bytes().strip()
    if re.fullmatch(rb'\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}', raw):
        updated = b'tester ' + raw + b'\n'
    elif re.fullmatch(rb'tester \$2[aby]\$\d\d\$[./A-Za-z0-9]{53}', raw):
        updated = raw + b'\n'
    else:
        raise ValueError('Credenziale non valida: atteso un hash bcrypt per tester')
    if updated == path.read_bytes():
        return
    fd, temp = tempfile.mkstemp(prefix='.auth-trial-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Expected path to staging credential secret')
    try:
        normalize(sys.argv[1])
    except (OSError, ValueError) as err:
        raise SystemExit(str(err)) from None
    print('Credenziale Caddy verificata (nessun segreto mostrato).')
