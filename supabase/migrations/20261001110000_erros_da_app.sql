-- Relatório de erros da app (leve). Cada pessoa com sessão só pode ESCREVER
-- os seus erros; ninguém os lê pela API (os administradores leem no painel /
-- SQL). Para gastar poucos dados e evitar abusos: textos curtos, no máximo 50
-- erros por pessoa em 24 horas, e apagados ao fim de 90 dias.

create table if not exists public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id   text check (device_id is null or length(device_id) <= 200),
  app_version text check (app_version is null or length(app_version) <= 30),
  platform    text check (platform is null or length(platform) <= 20),
  fatal       boolean not null default false,
  message     text not null check (length(message) between 1 and 500),
  stack       text check (stack is null or length(stack) <= 4000),
  screen      text check (screen is null or length(screen) <= 200),
  occurred_at timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists app_errors_created_at_idx on public.app_errors (created_at);
create index if not exists app_errors_user_created_idx on public.app_errors (user_id, created_at);

alter table public.app_errors enable row level security;

revoke all on table public.app_errors from anon, authenticated;
grant insert on table public.app_errors to authenticated;

drop policy if exists "Cada pessoa escreve os seus erros" on public.app_errors;
create policy "Cada pessoa escreve os seus erros"
  on public.app_errors
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- No máximo 50 erros por pessoa em 24 horas.
create or replace function private.limitar_erros_da_app()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.app_errors e
       where e.user_id = new.user_id and e.created_at > now() - interval '24 hours') >= 50 then
    raise exception 'APP_ERRORS_LIMITE: demasiados erros enviados nas ultimas 24 horas';
  end if;
  return new;
end;
$$;

revoke all on function private.limitar_erros_da_app() from public, anon, authenticated;

drop trigger if exists limitar_erros_da_app on public.app_errors;
create trigger limitar_erros_da_app
  before insert on public.app_errors
  for each row execute function private.limitar_erros_da_app();

-- Apagados ao fim de 90 dias (todos os dias às 03:30 UTC).
select cron.schedule(
  'limpeza-erros-da-app',
  '30 3 * * *',
  $cron$ delete from public.app_errors where created_at < now() - interval '90 days'; $cron$
);
