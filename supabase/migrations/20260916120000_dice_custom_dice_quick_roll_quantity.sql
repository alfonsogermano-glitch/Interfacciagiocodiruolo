alter table public.dice_custom_dice
  add column if not exists quick_roll_quantity integer not null default 1;

alter table public.dice_custom_dice
  drop constraint if exists dice_custom_dice_quick_roll_quantity_check;

alter table public.dice_custom_dice
  add constraint dice_custom_dice_quick_roll_quantity_check
  check (quick_roll_quantity between 1 and case when sides = 100 then 500 else 1000 end);
