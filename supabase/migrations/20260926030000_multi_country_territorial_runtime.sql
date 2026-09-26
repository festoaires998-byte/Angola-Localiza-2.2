-- Multi-country territorial runtime: shared configuration for APP and Web.
-- The schema deliberately avoids hard-coded "province/city/neighborhood" levels.
create table if not exists public.country_configs (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  name text not null,
  native_name text not null,
  locale text not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  currency_symbol text not null,
  phone_country_code text not null check (phone_country_code ~ '^\\+[0-9]{1,4}$'),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.country_territorial_levels (
  id bigint generated always as identity primary key,
  country_code text not null references public.country_configs(country_code) on delete cascade,
  level_key text not null,
  label text not null,
  plural_label text not null,
  level_order integer not null check (level_order > 0),
  is_locality boolean not null default false,
  created_at timestamptz not null default now(),
  unique(country_code, level_key),
);

create index if not exists idx_country_territorial_levels_country
  on public.country_territorial_levels(country_code, level_order);

alter table public.country_configs enable row level security;
alter table public.country_territorial_levels enable row level security;

drop policy if exists country_configs_public_read on public.country_configs;
create policy country_configs_public_read
  on public.country_configs for select
  using (enabled = true);

drop policy if exists country_territorial_levels_public_read on public.country_territorial_levels;
create policy country_territorial_levels_public_read
  on public.country_territorial_levels for select
  using (
    exists (
      select 1 from public.country_configs c
      where c.country_code = country_territorial_levels.country_code
        and c.enabled = true
    )
  );

insert into public.country_configs
(country_code,name,native_name,locale,currency_code,currency_symbol,phone_country_code,enabled)
values
('AO','Angola','Angola','pt-AO','AOA','Kz','+244',true),
('MZ','Mozambique','Moçambique','pt-MZ','MZN','MT','+258',false),
('CV','Cabo Verde','Cabo Verde','pt-CV','CVE','$','+238',false),
('GW','Guinea-Bissau','Guiné-Bissau','pt-GW','XOF','CFA','+245',false),
('ST','São Tomé and Príncipe','São Tomé e Príncipe','pt-ST','STN','Db','+239',false)
on conflict (country_code) do update set
  name=excluded.name,
  native_name=excluded.native_name,
  locale=excluded.locale,
  currency_code=excluded.currency_code,
  currency_symbol=excluded.currency_symbol,
  phone_country_code=excluded.phone_country_code,
  updated_at=now();

insert into public.country_territorial_levels
(country_code,level_key,label,plural_label,level_order,is_locality)
values
('AO','province','Província','Províncias',1,false),
('AO','municipality','Município','Municípios',2,false),
('AO','commune','Comuna','Comunas',3,false),
('AO','neighborhood','Bairro','Bairros',4,true),
('MZ','province','Província','Províncias',1,false),
('MZ','district','Distrito','Distritos',2,false),
('MZ','administrative_post','Posto Administrativo','Postos Administrativos',3,false),
('MZ','locality','Localidade','Localidades',4,true),
('CV','island','Ilha','Ilhas',1,false),
('CV','municipality','Concelho','Concelhos',2,false),
('CV','parish','Freguesia','Freguesias',3,false),
('CV','zone','Zona','Zonas',4,true),
('GW','region','Região','Regiões',1,false),
('GW','sector','Sector','Sectores',2,false),
('GW','sector','Sector','Sectores',2,false),
('GW','section','Secção','Secções',3,false),
('GW','tabanca','Tabanca','Tabancas',4,true),
('ST','district','Distrito','Distritos',1,false),
('ST','autonomous_region','Região Autónoma','Regiões Autónomas',1,false),
('ST','locality','Localidade','Localidades',2,true)
on conflict (country_code,level_key) do update set
  label=excluded.label,
  plural_label=excluded.plural_label,
  level_order=excluded.level_order,
  is_locality=excluded.is_locality;