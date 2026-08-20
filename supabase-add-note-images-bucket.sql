-- Bucket dedicato alle immagini caricate da file locale nell'editor note
-- (RichTextEditor.tsx, pulsante "Carica immagine da file") - pubblico in
-- lettura (getPublicUrl), scrittura ristretta al proprio utente via path
-- ${user.id}/... (primo segmento della cartella = auth.uid()), stesso
-- schema gia' in uso per il bucket 'avatars' (SettingsModal.tsx).
-- Nessuna policy di update/delete: la feature non offre modifica/rimozione
-- dell'immagine caricata.

insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do nothing;

create policy "note-images insert own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'note-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "note-images public read"
on storage.objects for select to public
using (bucket_id = 'note-images');
