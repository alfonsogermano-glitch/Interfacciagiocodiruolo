#!/usr/bin/env bash
# Read-only Docker/PG collection. Local writes only: immutable inputs and
# sanitized snapshots. NO migrations, role changes, API/Caddy recreation.
set -Eeuo pipefail
umask 077
die(){ echo "RECOVERY_COLLECTION_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'run once via sudo in the VPS terminal'
[[ $# == 1 && $1 =~ ^[a-f0-9]{64}$ ]] || die 'expected pinned input manifest digest'
source=/home/hgadmin/hg-recovery-inputs-20261121
work=/opt/hollowgate-recovery-snapshots-20261121
output=/home/hgadmin/hg-recovery-results-20261121
[[ ! -e $work && ! -e $output ]] || die 'collection already attempted; do not repeat'
[[ $(id -u hgadmin) != 0 ]] || die 'unexpected operator account'
[[ $(stat -c %u /opt) == 0 ]] || die 'unexpected /opt owner'
mkdir -m 700 "$work"
# Hash verification is performed on root-owned copies, never on files which
# an uploading user could replace between verification and execution.
for file in SHA256SUMS source-inventory.json collect-recovery-environment.mjs compare-recovery-environments.mjs; do
  [[ -f $source/$file && ! -L $source/$file ]] || die 'input missing or symlink'
  install -o root -g root -m 600 "$source/$file" "$work/$file"
done
[[ $(sha256sum "$work/SHA256SUMS" | head -c 64) == "$1" ]] || die 'input manifest digest mismatch'
(cd "$work" && sha256sum --status -c SHA256SUMS) || die 'immutable input hash mismatch'

production=hollowgate-production-private-aruba-api-1
staging=$(docker ps --filter label=com.docker.compose.project=hollowgate-auth-staging \
  --filter label=com.docker.compose.service=aruba-auth-staging --format '{{.ID}}')
[[ -n $staging && $staging != *$'\n'* ]] || die 'expected exactly one staging API'
collector=$(cat "$work/collect-recovery-environment.mjs")
docker exec -i "$production" node --input-type=module -e "$collector" -- --recovery-eval production \
  < "$work/source-inventory.json" > "$work/production.json" || die 'production catalog read failed'
echo 'RECOVERY_PRODUCTION_SNAPSHOT_OK'
docker exec -i "$staging" node --input-type=module -e "$collector" -- --recovery-eval staging \
  < "$work/source-inventory.json" > "$work/staging.json" || die 'staging catalog read failed'
echo 'RECOVERY_STAGING_SNAPSHOT_OK'

# Reuse an existing Node binary, without uploading or writing to its read-only
# container filesystem. Comparison gets only sanitized snapshots via stdin.
# This transport wrapper calls the unchanged offline comparison module.
python3 - "$work" <<'PY' > "$work/snapshots.json"
import json,sys
from pathlib import Path
p=Path(sys.argv[1])
print(json.dumps([json.loads((p/'staging.json').read_text()),json.loads((p/'production.json').read_text())]))
PY
compare=$(cat "$work/compare-recovery-environments.mjs")
# Its CLI guard sees argv[1] undefined under -e, so only the exported function
# below runs; no host paths are accessed by the comparison inside the API.
compare+=$'\nlet input="";for await(const chunk of process.stdin){input+=chunk;if(input.length>8000000)throw Error("Snapshot too large");}\nconst pair=JSON.parse(input);process.stdout.write(JSON.stringify(compareSnapshots(...pair),null,2)+"\\n");'
docker exec -i "$production" node --input-type=module -e "$compare" \
  < "$work/snapshots.json" > "$work/comparison.json" || die 'offline catalog comparison failed'

# The exported results contain only allowlisted metadata, no environment dump,
# user rows, SQL function bodies or secret file contents. Publish fixed files
# privately to the operator for authenticated SSH/SCP retrieval by this task.
mkdir -m 700 "$output"
chown hgadmin:hgadmin "$output"
for file in production.json staging.json comparison.json; do
  install -o hgadmin -g hgadmin -m 600 "$work/$file" "$output/$file"
done
(cd "$output" && sha256sum production.json staging.json comparison.json) > "$work/RESULT-SHA256SUMS"
install -o hgadmin -g hgadmin -m 600 "$work/RESULT-SHA256SUMS" "$output/SHA256SUMS"
echo 'RECOVERY_COLLECTION_OK — production/staging catalogs read; no database or service changes'
echo 'RECOVERY_RESULT_DIGESTS:'
cat "$work/RESULT-SHA256SUMS"
