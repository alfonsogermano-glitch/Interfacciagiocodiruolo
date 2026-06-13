-- Script per creare la campagna di default con l'UUID corretto
-- Esegui questo script nella dashboard di Supabase (SQL Editor)

-- Inserisci la campagna di default se non esiste
INSERT INTO campaigns (
  id,
  name,
  description,
  drama,
  owner_profile_id,
  created_at,
  updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000001'::uuid,
  'Campagna Principal',
  'La campagna principale di High School Cthulhu',
  1,
  'demo-user',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Verifica che la campagna sia stata creata
SELECT * FROM campaigns WHERE id = '10000000-0000-0000-0000-000000000001';
