-- A função moradas_ligadas_a_mim() (usada pela regra de leitura de addresses)
-- passa para o esquema "privado", que a API (PostgREST) não expõe: deixa de
-- se poder chamar por /rest/v1/rpc/moradas_ligadas_a_mim. Não havia fuga (só
-- devolve os ids ligados a quem pergunta), mas o aviso do Supabase fica
-- resolvido. A regra continua a funcionar: guarda a função pelo seu id interno.

create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to anon, authenticated, service_role;

alter function public.moradas_ligadas_a_mim() set schema privado;
