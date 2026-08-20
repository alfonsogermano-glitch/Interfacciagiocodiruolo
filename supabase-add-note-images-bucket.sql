-- Bucket dedicato alle immagini caricate da file locale nell'editor note
-- (RichTextEditor.tsx, pulsante "Carica immagine da file") - pubblico in
-- lettura (getPublicUrl), scrittura ristretta al proprio utente via path
-- ${user.id}/... (primo segmento della cartella = auth.uid()), stesso
-- schema gia' in uso per il bucket 'avatars' (SettingsModal.tsx).
-- Nessuna policy di update/delete: la feature non offre modifica/rimozione
-- dell'immagine caricata.

-- do update (non do nothing): bug reale 2026-08-20 - il bucket esisteva
-- gia' sul progetto (creato una volta dalla dashboard con "Public bucket"
-- disattivato) quando questo script e' stato eseguito la prima volta, "do
-- nothing" ha lasciato la riga com'era (public:false) invece di applicare
-- il valore voluto qui sotto - immagini caricate ma irraggiungibili
-- (getPublicUrl restituiva un URL che rispondeva 400 "Bucket not found",
-- il messaggio generico di Storage per un bucket privato). "do update"
-- rende lo script idempotente E autocorrettivo se rieseguito.
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do update set public = excluded.public;

create policy "note-images insert own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "note-images public read"
on storage.objects for select to public
using (bucket_id = 'note-images');
