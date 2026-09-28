-- KYC: uploads obrigatoriamente dentro da pasta do próprio utilizador.
drop policy if exists "Autenticado envia artefactos KYC na própria pasta" on storage.objects;

create policy "Autenticado envia artefactos KYC na própria pasta"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'kyc-artifacts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
