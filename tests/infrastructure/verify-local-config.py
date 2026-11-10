#!/usr/bin/env python3
"""Fail-closed contract for Hollowgate's synthetic local Supabase configuration."""
from pathlib import Path
import sys
import tomllib

root = Path(__file__).resolve().parents[2]
cfg_file = root / "supabase" / "config.toml"
data = tomllib.loads(cfg_file.read_text(encoding="utf-8"))
assert data["project_id"] == "hollowgate-local-staging"
assert data["db"]["major_version"] == 17
for service in ("api", "auth", "realtime", "storage"):
    assert data[service]["enabled"] is True, f"{service} disabled"
assert data["auth"]["site_url"].startswith("http://127.0.0.1:")
assert all(u.startswith("http://127.0.0.1:") for u in data["auth"]["additional_redirect_urls"])
for section in ("api", "db", "studio", "inbucket"):
    for key in ("port", "shadow_port"):
        if key in data[section]:
            assert isinstance(data[section][key], int)
text = cfg_file.read_text(encoding="utf-8").lower()
for forbidden in ("njcnkovruynhtsgzgrxi", "supabase.co", "service_role_key", "secret_key", "postgres://"):
    assert forbidden not in text, f"forbidden configuration marker: {forbidden}"
print("PASS: synthetic local Supabase config contract (Auth, Postgres, Realtime, Storage)")
