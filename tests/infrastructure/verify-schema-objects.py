#!/usr/bin/env python3
"""Validate metadata fingerprint inventory. No database connections."""
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SNAPSHOT=ROOT/"docs/infrastructure/SCHEMA_OBJECT_FINGERPRINTS_2026-11-10.json"
EXPECTED={"constraints":133,"indexes":98,"triggers":34,"functions":34,"policies":79}

def validate(data):
    assert data["schema"]=="public"
    for kind,count in EXPECTED.items():
        rows=data[kind]
        assert len(rows)==count,(kind,len(rows))
        keys=set()
        for row in rows:
            assert re.fullmatch(r"[0-9a-f]{32}",row["predicate_fingerprint"] if kind=="policies" else row["fingerprint"]),row
            key=(row.get("table",""),row["name"],row.get("args",""))
            assert key not in keys,(kind,key)
            keys.add(key)
            if kind=="functions": assert isinstance(row["security_definer"],bool)
            if kind=="policies": assert isinstance(row["unconditional"],bool)
    return True

if __name__=="__main__":
    validate(json.loads(SNAPSHOT.read_text(encoding="utf-8")))
    print("PASS: schema object fingerprints inventory (not SQL restore)")
