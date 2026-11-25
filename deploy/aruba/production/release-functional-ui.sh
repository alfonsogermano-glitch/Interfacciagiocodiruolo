#!/usr/bin/env bash
# Frontend-only corrective release. No SQL writes or container lifecycle calls.
set -Eeuo pipefail
umask 077
export LC_ALL=C
ID=20261124-functional-ui-01
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WEB=/opt/hollowgate/aruba-source/deploy/aruba/dist/vtt-pilot
BACKUP=/opt/hollowgate/backups/$ID
OLD=27bc4de8505f396d95ab833a6f2af645541f3e967086bc62e1654bde3e207c10
BASE=https://www.hollowgate.quest
changed=0
log(){ printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
die(){ log "STOP: $*" >&2; exit 1; }
hash(){ sha256sum "$1" | cut -d' ' -f1; }
public_hash(){ curl -fsS --max-time 60 "$1" | sha256sum | cut -d' ' -f1; }
finish(){
 local rc=$?
 trap - EXIT
 if (( rc != 0 && changed == 1 )); then
  if cp -a "$BACKUP/index.html" "$WEB/.index.rollback-$ID" &&
    mv -f "$WEB/.index.rollback-$ID" "$WEB/index.html" &&
    [[ $(public_hash "$BASE/vtt/") == "$OLD" ]]; then
   log 'ROLLBACK_OK: previous frontend index restored; no database changes'
  else
   log 'ROLLBACK_INCOMPLETE: inspect frontend immediately'
  fi
 fi
 exit "$rc"
}
secure(){
 local p mode
 for p in "$@"; do
  [[ ! -L $p && $(stat -c %u "$p") == 0 ]] || die "unsafe ownership/type: $p"
  mode=$(stat -c %a "$p")
  (( (8#$mode & 022) == 0 )) || die "unsafe permissions: $p"
 done
}
preflight(){
 local p
 secure "$ROOT"
 while IFS= read -r -d '' p; do secure "$p"; done < <(find "$ROOT" -mindepth 1 -print0)
 (cd "$ROOT" && sha256sum -c SHA256SUMS) || die 'bundle checksum mismatch'
 [[ $(hash "$WEB/index.html") == "$OLD" ]] || die 'unexpected current VTT index'
 [[ $(public_hash "$BASE/vtt/") == "$OLD" ]] || die 'public VTT differs from baseline'
 [[ ! -e $BACKUP ]] || die 'backup already exists: do not overwrite or blindly retry'
 for p in "$ROOT"/vtt/assets/*; do
  [[ -f $p && ! -L $p ]] || die 'unexpected asset type'
  if [[ -e $WEB/assets/$(basename "$p") ]]; then
   cmp -s "$p" "$WEB/assets/$(basename "$p")" || die 'asset name collision'
  fi
 done
 curl -fsS --max-time 20 "$BASE/ready" | grep -q '"database":"ready"' || die 'API not ready'
 log 'MEDIA_AUDIT: aggregate counts only, read-only'
 docker exec -i hollowgate-postgres-1 psql -X -A -t -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate <<'SQL'
BEGIN READ ONLY;
SELECT 'campaigns|'||count(*) FROM hollowgate_vtt.campaigns;
SELECT 'campaign_logos|'||count(*) FROM hollowgate_vtt.campaigns WHERE logo_asset_id IS NOT NULL;
SELECT 'campaign_covers|'||count(*) FROM hollowgate_vtt.campaigns WHERE cover_asset_id IS NOT NULL;
SELECT 'characters|'||count(*) FROM hollowgate_vtt.character_drafts;
SELECT 'character_portraits|'||count(*) FROM hollowgate_vtt.character_portraits;
SELECT 'visual_assets|'||count(*) FROM hollowgate_vtt.visual_assets;
SELECT 'characters_with_legacy_portrait_reference|'||count(*)
 FROM hollowgate_vtt.character_drafts
 WHERE coalesce(sheet_data->>'portraitImageUrl','')<>'';
COMMIT;
SQL
 log 'PREFLIGHT_OK: frontend only; no production changes'
}
main(){
 local mode=${1:-} p name expected
 [[ $EUID == 0 ]] || die 'run with sudo'
 [[ $mode == --preflight || $mode == --apply ]] || die 'usage: --preflight|--apply'
 exec 9>/run/lock/hollowgate-functional-ui.lock
 flock -n 9 || die 'another UI release is running'
 trap finish EXIT
 trap 'exit 1' HUP INT TERM
 preflight
 [[ $mode == --apply ]] || return 0
 mkdir -m 700 "$BACKUP"
 cp -a "$WEB/index.html" "$BACKUP/index.html"
 cp "$ROOT/SHA256SUMS" "$BACKUP/release.SHA256SUMS"
 cmp -s "$BACKUP/index.html" "$WEB/index.html" || die 'index backup mismatch'
 # Preserve shared assets and all older bundles for rollback and open tabs.
 for p in "$ROOT"/vtt/assets/*; do
  name=$(basename "$p")
  if [[ ! -e $WEB/assets/$name ]]; then
   install -o hgadmin -g hgadmin -m 0644 "$p" "$WEB/assets/.$name.$ID"
   mv -n "$WEB/assets/.$name.$ID" "$WEB/assets/$name"
  fi
  cmp -s "$p" "$WEB/assets/$name" || die 'installed asset differs'
 done
 install -o hgadmin -g hgadmin -m 0644 "$ROOT/vtt/index.html" "$WEB/.index.$ID"
 changed=1
 mv -f "$WEB/.index.$ID" "$WEB/index.html"
 expected=$(hash "$ROOT/vtt/index.html")
 [[ $(public_hash "$BASE/vtt/") == "$expected" ]] || die 'public index differs'
 for p in "$ROOT"/vtt/assets/*; do
  [[ $(public_hash "$BASE/vtt/assets/$(basename "$p")") == "$(hash "$p")" ]] ||
   die 'public asset hash differs'
 done
 curl -fsS --max-time 20 "$BASE/ready" | grep -q '"database":"ready"' || die 'API not ready'
 changed=0
 log "UI_RELEASE_OK: $ID; backup=$BACKUP; database and API unchanged"
}
main "$@"
