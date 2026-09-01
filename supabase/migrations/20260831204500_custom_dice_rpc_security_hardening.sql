alter function public.move_dice_library_node(text,uuid,uuid,integer) security definer;
alter function public.delete_dice_formula_folder(uuid,boolean) security definer;
revoke all on function public.normalize_dice_library_level(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.next_dice_library_sort_order(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.move_dice_library_node(text,uuid,uuid,integer) to authenticated;
grant execute on function public.delete_dice_formula_folder(uuid,boolean) to authenticated;
