-- Segurança (passos A e B do plano aprovado a 24/09/2026).
--
-- A. Funções SECURITY DEFINER que respondiam a qualquer pessoa, com ou sem sessão.
--
--   is_admin é usada em 22 regras de acesso (RLS) que correm com o papel de
--   quem pede (anon/authenticated). Não pode perder o EXECUTE, senão essas
--   regras falham. Passa a responder SÓ sobre a própria pessoa (as regras
--   perguntam sempre por auth.uid()) ou quando quem pergunta é o servidor
--   (service_role das Edge Functions, ou uma ligação direta à base de dados).
--   Assim já ninguém descobre se OUTRO utilizador é administrador.
--
--   As outras 7 não estão em regras de acesso nem são chamadas pela app ou
--   pelo site: só pelas Edge Functions, que usam a service_role. Deixam de
--   poder ser chamadas por anon e authenticated.
--
-- B. Bucket privado kyc-artifacts: até 10 MB por ficheiro (era 15 MB) e só
--   JPEG, PNG e video/webm (os vídeos de prova de vida do KYC do pessoal,
--   enviados pelo site antigo; o maior até hoje tem 3,8 MB).

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
      select 1 from organization_members
       where user_id = check_user_id
         and role in ('super_admin', 'admin_nacional', 'admin_provincial', 'admin_municipal')
    )
    and (
      check_user_id = auth.uid()
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or session_user <> 'authenticator'
    );
$$;

revoke execute on function public.is_id_verified(uuid) from public, anon, authenticated;
revoke execute on function public.can_validate_field(uuid) from public, anon, authenticated;
revoke execute on function public.can_manage_address(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.nearby_addresses(double precision, double precision, integer) from public, anon, authenticated;
revoke execute on function public.nearby_for_duplicates(double precision, double precision, integer) from public, anon, authenticated;
revoke execute on function public.get_next_house_number_for_street(uuid) from public, anon, authenticated;
revoke execute on function public.save_address_version() from public, anon, authenticated;

grant execute on function public.is_id_verified(uuid) to service_role;
grant execute on function public.can_validate_field(uuid) to service_role;
grant execute on function public.can_manage_address(uuid, uuid) to service_role;
grant execute on function public.nearby_addresses(double precision, double precision, integer) to service_role;
grant execute on function public.nearby_for_duplicates(double precision, double precision, integer) to service_role;
grant execute on function public.get_next_house_number_for_street(uuid) to service_role;
grant execute on function public.save_address_version() to service_role;

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'video/webm']
 where id = 'kyc-artifacts';
