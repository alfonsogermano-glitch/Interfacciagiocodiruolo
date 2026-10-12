-- Le mappe dei Capitoli condividono il bucket degli asset grafici. Il limite
-- deve coincidere con quello mostrato e validato dall'interfaccia.
insert into storage.buckets (id, name, public, file_size_limit)
values ('visual-assets', 'visual-assets', true, 52428800)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit;
