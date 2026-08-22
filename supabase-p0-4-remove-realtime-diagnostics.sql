-- P0.4 — Remove temporary Realtime diagnostic policies.
-- No application code references topic diag:test1. Production profile/campaign
-- and online:all policies are intentionally left untouched.

drop policy if exists "diag temp - listen diag:test1" on realtime.messages;
drop policy if exists "diag temp - track diag:test1" on realtime.messages;
