-- Icona opzionale per il titolo delle note nella colonna Note.
--
-- L'icona resta metadata separato da tab_name e da content/content_rich:
-- una singola colonna nullable garantisce naturalmente "zero o una icona"
-- per nota. I valori sono i nomi Lucide del catalogo curato gia' usato dal
-- picker inline (es. Sword, Eye, Dice6), quindi accettiamo solo identificatori
-- ASCII alfanumerici brevi.
--
-- La scrittura passa da una RPC strettamente scoped alle note di campagna.
-- Replica la regola applicativa gia' usata dal server:
--   * GM/proprietario della campagna: puo' modificare qualunque nota;
--   * membro: puo' modificare soltanto una propria nota;
--   * utente non membro, anonimo, nota cestinata o tab di altre entita': no.
--
-- Idempotente: puo' essere eseguito piu' volte senza duplicare colonne o
-- constraint. Nessun backfill: le note esistenti restano title_icon = NULL.

alter table public.entity_notes
  add column if not exists title_icon text;

alter table public.entity_notes
  drop constraint if exists entity_notes_title_icon_length_check;

alter table public.entity_notes
  add constraint entity_notes_title_icon_length_check
  check (
    title_icon is null
    or title_icon ~ '^[A-Za-z][A-Za-z0-9]{0,63}$'
  );

create or replace function public.set_entity_note_title_icon(
  p_note_id uuid,
  p_title_icon text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id text := auth.uid()::text;
  v_note record;
  v_is_gm boolean := false;
  v_is_member boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  if p_title_icon is not null
     and p_title_icon !~ '^[A-Za-z][A-Za-z0-9]{0,63}$' then
    raise exception 'Icona titolo non valida' using errcode = '22023';
  end if;

  select
    n.id,
    n.campaign_id,
    n.entity_type,
    n.owner_profile_id,
    n.deleted_at
  into v_note
  from public.entity_notes n
  where n.id = p_note_id;

  if not found or v_note.deleted_at is not null then
    raise exception 'Nota non trovata' using errcode = 'P0002';
  end if;

  -- Questa feature e' intenzionalmente limitata alle note di primo livello
  -- della colonna Note (entity_type='campaign'), non alle tab di PG/PNG/
  -- Mostro e non alle sotto-tab interne.
  if v_note.entity_type <> 'campaign' or v_note.campaign_id is null then
    raise exception 'Icona titolo non disponibile per questa tab' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.campaigns c
    where c.id = v_note.campaign_id
      and c.owner_profile_id = v_user_id
      and c.deleted_at is null
  ) into v_is_gm;

  if not v_is_gm then
    select exists (
      select 1
      from public.campaign_members cm
      where cm.campaign_id = v_note.campaign_id
        and cm.profile_id = v_user_id
    ) into v_is_member;

    if not v_is_member or v_note.owner_profile_id is distinct from v_user_id then
      raise exception 'Non hai accesso a questa nota' using errcode = '42501';
    end if;
  end if;

  update public.entity_notes
  set
    title_icon = p_title_icon,
    updated_at = now()
  where id = p_note_id;
end;
$$;

revoke all on function public.set_entity_note_title_icon(uuid, text) from public;
grant execute on function public.set_entity_note_title_icon(uuid, text) to authenticated;
