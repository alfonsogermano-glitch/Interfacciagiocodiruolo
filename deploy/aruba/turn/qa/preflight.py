#!/usr/bin/env python3
"""Read-only, fail-closed staging TURN preflight. Never starts containers or edits firewall."""
import argparse
import ipaddress
import os
import pathlib
import re
import socket
import stat
import subprocess
import sys

PORTS = ((3478, "udp"), (3478, "tcp"), (5349, "tcp"))
RELAY_RANGE = range(49160, 49201)

class PreflightError(Exception):
    pass

def validated_identity(host, ip, resolved):
    # Reject numeric aliases, empty labels, labels starting/ending in '-',
    # and input that cannot be a standards-compliant DNS hostname.
    labels = host.split(".") if isinstance(host, str) else []
    if (not labels or len(host) > 253 or len(labels) < 2 or
        any(not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label)
            for label in labels) or labels[-1].isdigit()):
        raise PreflightError("TURN hostname non valido")
    try:
        public = ipaddress.ip_address(ip)
    except ValueError as exc:
        raise PreflightError("IP TURN non valido") from exc
    if public.version != 4 or not public.is_global:
        raise PreflightError("IP TURN non pubblico")
    if ip not in resolved:
        raise PreflightError("DNS del TURN non corrisponde all'IPv4 pubblico")
    return host, ip

def inspect_file(path, uid, *, min_bytes=1):
    try:
        info = path.stat()
    except OSError as exc:
        raise PreflightError("File privato non accessibile") from exc
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size < min_bytes:
        raise PreflightError("File privato con proprietario, permessi o dimensione non validi")

def certificate_check(cert, key, hostname, command=subprocess.run):
    def openssl(*args):
        try:
            proc = command(["openssl", *args], capture_output=True, check=False, timeout=10)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise PreflightError("OpenSSL indisponibile") from exc
        if proc.returncode != 0:
            raise PreflightError("Certificato o chiave TURN non validi")
        return proc.stdout
    name_check = openssl("x509", "-in", str(cert), "-noout", "-checkhost", hostname)
    if "does match certificate" not in name_check.decode("utf8", "replace"):
        raise PreflightError("Certificato TLS non valido per hostname TURN")
    openssl("x509", "-in", str(cert), "-noout", "-checkend", "604800")
    # OpenSSL uses the system CA store by default. A leaf certificate being
    # syntactically valid is not proof that browsers will trust its issuer.
    openssl("verify", "-purpose", "sslserver", "-verify_hostname", hostname,
            "-untrusted", str(cert), str(cert))
    cert_public = openssl("x509", "-in", str(cert), "-pubkey", "-noout")
    key_public = openssl("pkey", "-in", str(key), "-pubout")
    if cert_public.strip() != key_public.strip():
        raise PreflightError("La chiave TLS TURN non corrisponde al certificato")

def parse_ss_bindings(output):
    """Return local listening addresses/ports, ignoring peer-address columns."""
    result = set()
    for line in output.splitlines():
        columns = line.split()
        if len(columns) < 5 or columns[0] not in ("tcp", "udp"):
            continue
        local = columns[4]
        port = local.rsplit(":", 1)[-1]
        if port.isdecimal():
            result.add((int(port), columns[0]))
    return result

def check_ports(output):
    bindings = parse_ss_bindings(output)
    overlaps = [(port, proto) for port, proto in PORTS if (port, proto) in bindings]
    overlaps += [(port, "udp") for port in RELAY_RANGE if (port, "udp") in bindings]
    if overlaps:
        # Do not expose process names, PIDs or private addresses.
        raise PreflightError("Porte TURN già occupate: " + ", ".join(f"{port}/{proto}" for port, proto in overlaps))

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hostname", required=True)
    parser.add_argument("--ipv4", required=True)
    parser.add_argument("--turn-secret", default="/opt/hollowgate/config/turn_shared_secret")
    parser.add_argument("--api-secret", default="/opt/hollowgate/config/turn_api_shared_secret")
    parser.add_argument("--certificate", default="/opt/hollowgate/config/tls/turn-fullchain.pem")
    parser.add_argument("--key", default="/opt/hollowgate/config/tls/turn-privkey.pem")
    args = parser.parse_args(argv)
    try:
        addresses = {result[4][0] for result in socket.getaddrinfo(args.hostname, None, family=socket.AF_INET)}
        validated_identity(args.hostname, args.ipv4, addresses)
        turn_path,api_path = pathlib.Path(args.turn_secret),pathlib.Path(args.api_secret)
        inspect_file(turn_path, 65534, min_bytes=64)
        inspect_file(api_path, 1001, min_bytes=64)
        # Compare bytes without printing either private file.
        turn_secret = turn_path.read_bytes().removesuffix(b"\n")
        api_secret = api_path.read_bytes().removesuffix(b"\n")
        if not re.fullmatch(rb"[0-9a-f]{64}", turn_secret) or turn_secret != api_secret:
            raise PreflightError("I segreti TURN e API non coincidono o sono malformati")
        cert_path,key_path = pathlib.Path(args.certificate),pathlib.Path(args.key)
        inspect_file(key_path, 65534)
        if not cert_path.is_file():
            raise PreflightError("Certificato TURN mancante")
        certificate_check(cert_path,key_path,args.hostname)
        try:
            listeners = subprocess.run(["ss","-H","-tuln"],capture_output=True,text=True,check=True,timeout=10).stdout
        except (OSError,subprocess.TimeoutExpired,subprocess.CalledProcessError) as exc:
            raise PreflightError("Impossibile verificare le porte con ss") from exc
        check_ports(listeners)
    except (PreflightError, OSError, socket.gaierror) as exc:
        print("TURN_PREFLIGHT_BLOCKED: " + str(exc), file=sys.stderr)
        return 1
    print("TURN_PREFLIGHT_LOCAL_SUCCESS: DNS, file, certificato e porte verificati; nessun servizio avviato")
    print("NOT VERIFIED: firewall Aruba, traffico esterno, NAT, TLS da remoto, PC/Android")
    return 0

if __name__ == "__main__":
    sys.exit(main())
