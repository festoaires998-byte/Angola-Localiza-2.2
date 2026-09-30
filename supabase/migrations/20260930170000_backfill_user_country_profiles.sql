-- Contas criadas antes do gatilho on_auth_user_created_country ficaram sem
-- perfil de país (7 de 8). Sem ele, a candidatura de motorista e a escolha do
-- país na app falhavam. País: o escolhido no registo, senão Angola.
insert into public.user_country_profiles (user_id, country_code)
select u.id,
       case
         when upper(coalesce(u.raw_user_meta_data->>'country_code', '')) in (select country_code from public.country_configs where enabled)
           then upper(u.raw_user_meta_data->>'country_code')
         else 'AO'
       end
from auth.users u
where not exists (select 1 from public.user_country_profiles p where p.user_id = u.id)
on conflict (user_id) do nothing;
