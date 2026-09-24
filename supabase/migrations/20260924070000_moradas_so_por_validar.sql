-- Moradas: ninguém cria uma morada já aprovada nem mexe na validação pela API
-- direta (PostgREST). É o mesmo buraco da sync v7, pelo outro caminho.
--
-- 1. Criar diretamente (o site antigo grava assim quando tem rede): só por
--    validar (PROPOSED), em nome de quem cria e sem os campos da validação.
-- 2. Mudar diretamente: ninguém (nem o site nem a app o fazem). As correções
--    passam pela sync (update_address) e a validação pela field-service.

drop policy if exists "Criar morada própria" on public.addresses;
create policy "Criar morada própria"
  on public.addresses
  for insert
  with check (
    created_by = (select auth.uid())
    and status = 'PROPOSED'
    and validated_by is null
    and validated_at is null
    and confidence_score is null
    and coalesce(flagged_for_review, false) = false
  );

drop policy if exists "Editar morada própria enquanto proposta" on public.addresses;
revoke update, truncate on public.addresses from anon, authenticated;
