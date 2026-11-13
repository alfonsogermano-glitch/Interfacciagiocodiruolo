#!/bin/sh
# Fail-closed coturn staging launcher; never print the shared secret.
set -eu
umask 077
secret_file=/run/secrets/turn_shared_secret
config_file=/run/hollowgate/turnserver.conf
[ -r "$secret_file" ] || { echo "TURN secret missing" >&2; exit 1; }
[ -r /run/tls/turn-fullchain.pem ] && [ -r /run/tls/turn-privkey.pem ] || {
  echo "TURN TLS certificate/key missing" >&2; exit 1;
}
case "${TURN_HOSTNAME:-}" in
  ''|*[!a-zA-Z0-9.-]*) echo "Invalid TURN hostname" >&2; exit 1 ;;
esac
case "$TURN_HOSTNAME" in
  .*|*.|*..*) echo "Invalid TURN hostname" >&2; exit 1 ;;
esac
case "${TURN_PUBLIC_IPV4:-}" in
  ''|*[!0-9.]*) echo "Invalid public IPv4" >&2; exit 1 ;;
esac
# This checks syntax, not ownership or real public routability; operator MUST verify.
printf '%s\n' "$TURN_PUBLIC_IPV4" | awk -F. '
 NF!=4 {exit 1}
 {for(i=1;i<=4;i++)if($i=="" || $i !~ /^[0-9]+$/ || $i>255)exit 1}
' || { echo "Malformed TURN public IPv4" >&2; exit 1; }
secret="$(cat "$secret_file")"
# Generate exactly 32 cryptographic bytes as 64 lowercase ASCII hex chars
# and give this same FILE to the Aruba API TURN_SHARED_SECRET_FILE option.
[ "${#secret}" -eq 64 ] || { echo "TURN secret must be 64 hex characters" >&2; exit 1; }
case "$secret" in
 *[!0-9a-f]*) echo "TURN secret must be lowercase hex" >&2; exit 1 ;;
esac
cat > "$config_file" <<EOF
fingerprint
lt-cred-mech
use-auth-secret
realm=$TURN_HOSTNAME
server-name=$TURN_HOSTNAME
listening-port=3478
tls-listening-port=5349
external-ip=$TURN_PUBLIC_IPV4
min-port=49160
max-port=49200
cert=/run/tls/turn-fullchain.pem
pkey=/run/tls/turn-privkey.pem
no-cli
no-dtls
no-loopback-peers
no-multicast-peers
no-tlsv1
no-tlsv1_1
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=224.0.0.0-255.255.255.255
EOF
printf 'static-auth-secret=%s\n' "$secret" >> "$config_file"
unset secret
chmod 600 "$config_file"
exec turnserver --config "$config_file"
