# Chapter timestamp read compatibility — 20261125-chapter-dates-05

Follow-up to data-guards-04; no database or API changes.

## Reproduced cause

`migrateChapters` retained `created_at` and `updated_at` in the payload, while
the frontend requires canonical `createdAt` and `updatedAt`. Mapping known
legacy map URLs alone did not resolve the warning. All 17 exported source
chapters fail before timestamp adaptation and pass after it. Production audit
also reported 17 chapters, but live authenticated acceptance is still required.

## Correction

Read-only chapter model adapter maps the two SQL aliases only when their modern
field is absent. Known UTC timestamp formats (including PostgreSQL microseconds
and +00:00) normalize to millisecond ISO UTC. It invents no current timestamps,
does not mutate the response/source payload, and retains strict calendar,
chapter identity and other model validation. A malformed modern field remains
an error rather than silently falling back to an older alias.

## Verification

- Frontend tests: 543 passing.
- Exact local source export replay: 17/17 chapters accepted.
- Production candidate builds in `.local/vtt-chapter-dates-candidate`.
- Focused Chromium scenario passes with SQL-style timestamps and the known
  historical map URL; chapter selector is enabled.
- Separate malformed chapter scenario still disables placement without
  preventing sheet access. Notes/dice/sheet regression flow passes.

## Handoff and exclusions

Bundle `/home/hgadmin/hg-chapter-dates-05.tar.gz`, top-level
`hg-chapter-dates-05`. Runner supports `--preflight` / `--apply`, exact
data-guards-04 index baseline, backup, atomic frontend swap and rollback.

This does not delete recovery placeholders or their notes, restore image
associations, or claim complete Chapter/Scene editor parity.
