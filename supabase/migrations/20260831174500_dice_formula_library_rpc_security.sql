-- Structural library RPCs call SECURITY DEFINER helper functions whose EXECUTE
-- privilege is intentionally revoked from authenticated users. Run the public
-- entry points as SECURITY DEFINER while keeping their explicit auth.uid()
-- ownership checks, so authenticated users cannot invoke the helpers directly.
alter function public.move_dice_library_node(text, uuid, uuid, integer) security definer;
alter function public.delete_dice_formula_folder(uuid, boolean) security definer;
