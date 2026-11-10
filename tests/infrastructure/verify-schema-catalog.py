#!/usr/bin/env python3
"""Validate read-only catalog metadata. No database, network or secrets."""
import json
from pathlib import Path
FILE = Path(__file__).resolve().parents[2]/"docs/infrastructure/SCHEMA_CATALOG_METADATA_2026-11-10.json"

def validate(data):
    assert data["schema"] == "public"
    tables = data["tables"]
    assert len(tables) == 31, "unexpected public table count"
    names = [table["table"] for table in tables]
    assert names == sorted(names) and len(set(names)) == len(names)
    assert {"campaigns","campaign_members","profiles","characters","chat_messages"}.issubset(names)
    assert all(t["rls"] is True for t in tables)
    for t in tables:
        columns = t["columns"]
        assert columns and len({c["name"] for c in columns}) == len(columns)
        assert all(c["type"] and isinstance(c["nullable"],bool) for c in columns)
        assert isinstance(t["policies"],list) and isinstance(t["foreign_keys"],list)
        assert all(p["name"] for p in t["policies"])
    return True

if __name__ == "__main__":
    validate(json.loads(FILE.read_text()))
    print("PASS: metadata snapshot structurally valid (not a database restore)")
