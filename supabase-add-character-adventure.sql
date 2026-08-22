-- P0.2: PG -> Avventura. NULL significa "tutta la campagna".
-- Additivo e idempotente; nessun dato PG esistente viene modificato.

alter table public.characters
  add column if not exists adventure_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'characters_adventure_id_fkey'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table public.characters
      add constraint characters_adventure_id_fkey
      foreign key (adventure_id)
      references public.adventures(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_characters_adventure
  on public.characters(adventure_id);
