-- Unicità case-insensitive di profiles.display_name.
-- Nessun duplicato esistente confermato (query di verifica vuota) -> nessuna
-- sanificazione preventiva necessaria, si applica direttamente.

CREATE UNIQUE INDEX profiles_display_name_unique_ci
  ON public.profiles (lower(btrim(display_name)));
