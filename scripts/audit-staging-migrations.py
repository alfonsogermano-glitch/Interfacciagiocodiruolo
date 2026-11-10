#!/usr/bin/env python3
"""Read-only staging migration inventory. Does not run SQL or contact production."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Tables needed before Hollowgate's archived incremental migrations may be applied.
BASE_TABLES = ("campaigns", "profiles", "campaign_members", "characters")
SENSITIVE_TABLES = ("chat_messages",)

def inspect(root: Path) -> dict:
    supa = root / "supabase"
    migrations = sorted((supa / "migrations").glob("*.sql"))
    legacy = sorted(supa.glob("20*.sql"))
    all_sql = [*migrations, *legacy]
    creates = set()
    unsafe = []
    for path in all_sql:
        content = path.read_text(encoding="utf-8")
        for table in re.findall(r"\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?[\"\x60]?([a-zA-Z_][a-zA-Z_0-9]*)", content, re.I):
            creates.add(table.lower())
        # Flag, do not execute: permissive policies are unsuitable for a trusted baseline.
        if re.search(r"\b(?:using|with\s+check)\s*\(\s*true\s*\)", content, re.I):
            unsafe.append(str(path.relative_to(root)))
    missing = sorted(set(BASE_TABLES) - creates)
    blockers = []
    if missing:
        blockers.append("Missing baseline CREATE TABLE definitions: " + ", ".join(missing))
    if legacy:
        blockers.append("Legacy root SQL files are outside supabase/migrations and not ordered by the CLI")
    if unsafe:
        blockers.append("Unrestricted USING(true) / WITH CHECK(true) policies require authorization review")
    if not (supa / "functions" / "make-server-771c5bfd" / "index.ts").is_file():
        blockers.append("Missing API Edge Function entrypoint")
    if not (supa / "functions" / "dice-secret-roll" / "index.ts").is_file():
        blockers.append("Missing secret dice Edge Function entrypoint")
    return {
        "ready_for_schema_apply": not blockers,
        "migration_files": len(migrations),
        "legacy_root_sql_files": len(legacy),
        "created_tables_detected": sorted(creates),
        "missing_baseline_tables": missing,
        "permissive_policy_files": unsafe,
        "blockers": blockers,
    }

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT, help="Local repository only")
    parser.add_argument("--require-ready", action="store_true", help="Exit nonzero when schema is incomplete")
    args = parser.parse_args()
    result = inspect(args.root.resolve())
    print(json.dumps(result, indent=2, sort_keys=True))
    return 2 if args.require_ready and result["blockers"] else 0

if __name__ == "__main__":
    raise SystemExit(main())
