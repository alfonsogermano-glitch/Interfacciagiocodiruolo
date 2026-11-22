#!/usr/bin/env bash
set -Eeuo pipefail
log=/home/hgadmin/hollowgate-private-upload/private-auth-restore.log
finish(){ chown hgadmin:hgadmin "$log" 2>/dev/null || true; chmod 600 "$log" 2>/dev/null || true; }
trap finish EXIT
exec >"$log" 2>&1
container=$(docker ps --filter label=com.docker.compose.service=postgres --format '{{.Names}}' | head -1)
test -n "$container"
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate <<'SQL'
BEGIN;
DELETE FROM hollowgate_auth.sessions WHERE user_id=(SELECT id FROM hollowgate_auth.users WHERE email='alfonso.germano@gmail.com');
DELETE FROM hollowgate_auth.password_credentials WHERE user_id=(SELECT id FROM hollowgate_auth.users WHERE email='alfonso.germano@gmail.com');
UPDATE hollowgate_auth.users SET status='pending_reset',email_verified_at=NULL WHERE email='alfonso.germano@gmail.com';
COMMIT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hollowgate_auth.users WHERE email='alfonso.germano@gmail.com' AND status='pending_reset' AND email_verified_at IS NULL) THEN RAISE EXCEPTION 'user restore failed'; END IF;
  IF EXISTS (SELECT 1 FROM hollowgate_auth.password_credentials c JOIN hollowgate_auth.users u ON u.id=c.user_id WHERE u.email='alfonso.germano@gmail.com') THEN RAISE EXCEPTION 'credential restore failed'; END IF;
  IF EXISTS (SELECT 1 FROM hollowgate_auth.sessions s JOIN hollowgate_auth.users u ON u.id=s.user_id WHERE u.email='alfonso.germano@gmail.com') THEN RAISE EXCEPTION 'session cleanup failed'; END IF;
END $$;
SQL
echo PRIVATE_AUTH_STATE_RESTORED
