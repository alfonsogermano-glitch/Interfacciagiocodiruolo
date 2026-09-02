-- Allow Custom Die faces whose visual is user-entered text.
-- The client validator already supports kind='text'; keep the database trigger in sync.
create or replace function public.validate_dice_custom_die()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_expected integer;
  v_role text;
  v_role_expected integer;
  v_count integer;
  v_distinct_indices integer;
  v_min_index integer;
  v_max_index integer;
  v_face jsonb;
  v_visual jsonb;
  v_campaign uuid;
  v_owner uuid;
begin
  new.name:=btrim(new.name);
  v_expected:=case when new.sides=100 then 20 else new.sides end;
  if jsonb_typeof(new.faces)<>'array' or jsonb_array_length(new.faces)<>v_expected then
    raise exception 'Numero di facce non valido per il dado custom.';
  end if;

  if new.folder_id is not null then
    select campaign_id,owner_profile_id into v_campaign,v_owner
    from public.dice_formula_folders
    where id=new.folder_id;
    if not found or v_campaign<>new.campaign_id or v_owner<>new.owner_profile_id then
      raise exception 'Il dado custom deve appartenere alla stessa libreria della cartella.';
    end if;
  end if;

  if new.sides=100 then
    for v_role in select unnest(array['tens','units']::text[]) loop
      v_role_expected:=10;
      select count(*),count(distinct (f->>'index')::integer),min((f->>'index')::integer),max((f->>'index')::integer)
      into v_count,v_distinct_indices,v_min_index,v_max_index
      from jsonb_array_elements(new.faces) f
      where f->>'role'=v_role and jsonb_typeof(f->'index')='number';
      if v_count<>v_role_expected or v_distinct_indices<>v_role_expected or v_min_index<>1 or v_max_index<>v_role_expected then
        raise exception 'Indici o ruoli delle facce non validi per il dado custom.';
      end if;
    end loop;
  else
    v_role_expected:=new.sides;
    select count(*),count(distinct (f->>'index')::integer),min((f->>'index')::integer),max((f->>'index')::integer)
    into v_count,v_distinct_indices,v_min_index,v_max_index
    from jsonb_array_elements(new.faces) f
    where f->>'role'='single' and jsonb_typeof(f->'index')='number';
    if v_count<>v_role_expected or v_distinct_indices<>v_role_expected or v_min_index<>1 or v_max_index<>v_role_expected then
      raise exception 'Indici o ruoli delle facce non validi per il dado custom.';
    end if;
  end if;

  for v_face in select value from jsonb_array_elements(new.faces) loop
    if jsonb_typeof(v_face)<>'object' then
      raise exception 'Definizione faccia non valida.';
    end if;
    if new.sides=100 and coalesce(v_face->>'role','') not in ('tens','units') then
      raise exception 'Ruolo faccia d100 non valido.';
    end if;
    if new.sides<>100 and coalesce(v_face->>'role','')<>'single' then
      raise exception 'Ruolo faccia non valido.';
    end if;

    v_visual:=v_face->'visual';
    if jsonb_typeof(v_visual)<>'object' then
      raise exception 'Visuale faccia non valida.';
    end if;

    if v_visual->>'kind'='icon' then
      if length(btrim(coalesce(v_visual->>'iconName','')))=0 then
        raise exception 'Icona faccia mancante.';
      end if;
    elsif v_visual->>'kind'='image' then
      if length(btrim(coalesce(v_visual->>'assetPath','')))=0
         or length(btrim(coalesce(v_visual->>'publicUrl','')))=0 then
        raise exception 'Asset faccia mancante.';
      end if;
    elsif v_visual->>'kind'='text' then
      if length(btrim(coalesce(v_visual->>'text','')))=0 then
        raise exception 'Testo faccia mancante.';
      end if;
    else
      raise exception 'Tipo visuale faccia non valido.';
    end if;

    if v_face ? 'numericValue'
       and v_face->'numericValue'<>'null'::jsonb
       and jsonb_typeof(v_face->'numericValue')<>'number' then
      raise exception 'Valore numerico faccia non valido.';
    end if;
  end loop;

  return new;
end;
$$;
