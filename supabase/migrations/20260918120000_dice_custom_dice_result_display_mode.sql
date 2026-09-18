alter table public.dice_custom_dice
  add column if not exists result_display_mode text not null default 'single';

alter table public.dice_custom_dice
  drop constraint if exists dice_custom_dice_result_display_mode_check;

alter table public.dice_custom_dice
  add constraint dice_custom_dice_result_display_mode_check
  check (result_display_mode in ('single', 'grouped'));
