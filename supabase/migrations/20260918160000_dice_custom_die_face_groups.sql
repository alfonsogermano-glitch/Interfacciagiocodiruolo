create or replace function public.validate_dice_custom_die_face_groups()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_face jsonb;
  v_group numeric;
begin
  if jsonb_typeof(new.faces)<>'array' then
    return new;
  end if;
  for v_face in select value from jsonb_array_elements(new.faces) loop
    if v_face ? 'resultGroup' and v_face->'resultGroup'<>'null'::jsonb then
      if jsonb_typeof(v_face->'resultGroup')<>'number' then
        raise exception 'Gruppo faccia non valido.';
      end if;
      v_group:=(v_face->>'resultGroup')::numeric;
      if v_group<1 or v_group<>trunc(v_group) then
        raise exception 'Il gruppo faccia deve essere un intero positivo.';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists validate_dice_custom_die_face_groups_trigger on public.dice_custom_dice;
create trigger validate_dice_custom_die_face_groups_trigger
before insert or update on public.dice_custom_dice
for each row execute function public.validate_dice_custom_die_face_groups();
