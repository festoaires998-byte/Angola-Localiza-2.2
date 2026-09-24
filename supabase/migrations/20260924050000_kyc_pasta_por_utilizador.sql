-- Segurança (passo C do plano aprovado a 24/09/2026). Aplicar DEPOIS da
-- citizen-verify v5 (que aceita fotos na pasta de quem pede).
--
-- No bucket privado kyc-artifacts, cada pessoa só pode enviar para a SUA
-- pasta ("<id do utilizador>/…"), como a app faz desde esta versão.
-- TEMPORÁRIO: a raiz do bucket continua aceite, porque o site antigo ainda
-- envia para lá (fotos do cidadão e o KYC do pessoal). Passo D (depois do
-- hotfix do site): tirar a condição da raiz.

drop policy if exists "Autenticado envia os próprios artefactos KYC" on storage.objects;
drop policy if exists "Autenticado envia artefactos KYC na própria pasta" on storage.objects;

create policy "Autenticado envia artefactos KYC na própria pasta"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'kyc-artifacts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      -- temporário, para o site antigo (passo D: remover)
      or position('/' in name) = 0
    )
  );
