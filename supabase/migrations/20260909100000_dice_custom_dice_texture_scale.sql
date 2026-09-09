alter table public.dice_custom_dice
  add column if not exists texture_scale integer not null default 138;

alter table public.dice_custom_dice
  drop constraint if exists dice_custom_dice_texture_scale_check;

alter table public.dice_custom_dice
  add constraint dice_custom_dice_texture_scale_check
  check (texture_scale between 100 and 200);
