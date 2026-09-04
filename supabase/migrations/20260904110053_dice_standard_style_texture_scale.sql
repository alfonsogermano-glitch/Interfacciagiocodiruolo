alter table public.dice_standard_styles
  add column if not exists texture_scale integer not null default 138;

alter table public.dice_standard_styles
  drop constraint if exists dice_standard_styles_texture_scale_check;

alter table public.dice_standard_styles
  add constraint dice_standard_styles_texture_scale_check
  check (texture_scale between 100 and 200);
