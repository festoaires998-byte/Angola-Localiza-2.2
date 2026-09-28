-- Campo: cada utilizador autenticado só pode carregar fotos dentro da sua própria pasta.
-- A leitura continua pública porque as URLs das fotos de campo são usadas nos
-- processos de validação/auditoria e no resultado da morada.
drop policy if exists "Qualquer autenticado pode enviar fotos de campo" on storage.objects;

create policy "Utilizador só envia as próprias fotos de campo"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'field-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
