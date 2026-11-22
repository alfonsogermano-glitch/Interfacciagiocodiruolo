#!/usr/bin/env python3
"""Build, never install, the narrow public-auth Caddyfile change.

Requires an exact copy of the *live* Caddyfile as input. The staging and apex
sites must remain byte-for-byte unchanged. Refuses unknown or already-modified
public matcher layouts rather than guessing where to insert routes.
"""
import argparse
import re
from pathlib import Path

OLD = {
    "@publicAuthPages": "@publicAuthPages path / /login /forgot-password /account/password",
    "@authPages": "@authPages path /login /forgot-password /account/password",
}
SUFFIX = " /signup /account/verify-email"


def make_candidate(source: str) -> str:
    marker = "www.hollowgate.quest {\n"
    if source.count(marker) != 1:
        raise ValueError("Expected exactly one www.hollowgate.quest site")
    start = source.index(marker) + len(marker)
    end_match = re.search(r"^}\s*$", source[start:], re.MULTILINE)
    if end_match is None:
        raise ValueError("Public site closing brace not found")
    end = start + end_match.start()
    public = source[start:end]
    for name, old in OLD.items():
        matches = re.findall(r"^\s*" + re.escape(old) + r"\s*$", public, re.MULTILINE)
        if len(matches) != 1:
            raise ValueError(f"Unexpected or previously changed {name} matcher")
        public = re.sub(r"^(\s*)" + re.escape(old) + r"[ \t]*$",
                        lambda m: m.group(1) + old + SUFFIX,
                        public, count=1, flags=re.MULTILINE)
    result = source[:start] + public + source[end:]
    if public.count(SUFFIX) != 2:
        raise ValueError("Unexpected route count")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve() or args.output.exists():
        parser.error("Output must be a new file, never the live input")
    original = args.source.read_bytes()
    if b"\r" in original:
        parser.error("Unexpected Caddyfile line endings")
    candidate = make_candidate(original.decode("utf-8")).encode("utf-8")
    args.output.write_bytes(candidate)


if __name__ == "__main__":
    main()
