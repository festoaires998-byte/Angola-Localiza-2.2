-- Completes the multi-country runtime schema on installations that had the legacy country_configs table.
alter table public.country_configs
  add column if not exists name text,
  add column if not exists native_name text,
  add column if not exists locale text,
  add column if not exists currency_symbol text,
  add column if not exists enabled boolean;

update public.country_configs
set name=coalesce(name,country_name),
    native_name=coalesce(native_name,country_name),
    locale=coalesce(locale,'pt-AO'),
    currency_symbol=coalesce(currency_symbol,case when currency_code='AOA' then 'Kz' else currency_code end),
    enabled=coalesce(enabled,is_active);

insert into public.country_configs
(country_code,country_name,currency_code,phone_country_code,address_hierarchy,is_active,name,native_name,locale,currency_symbol,enabled)
values
('MZ','Moçambique','MZN','+258','["province","district","administrative_post","locality"]',false,'Mozambique','Moçambique','pt-MZ','MT',false),
('CV','Cabo Verde','CVE','+238','["island","municipality","parish","zone"]',false,'Cabo Verde','Cabo Verde','pt-CV','$',false),
('GW','Guiné-Bissau','XOF','+245','["region","sector","section","tabanca"]',false,'Guinea-Bissau','Guiné-Bissau','pt-GW','CFA',false),
('ST','São Tomé e Príncipe','STN','+239','["district","autonomous_region","locality"]',false,'São Tomé and Príncipe','São Tomé e Príncipe','pt-ST','Db',false)
on conflict (country_code) do update set
 name=excluded.name,native_name=excluded.native_name,locale=excluded.locale,
 currency_symbol=excluded.currency_symbol,updated_at=now();

alter table public.country_configs alter column name set not null;
alter table public.country_configs alter column native_name set not null;
alter table public.country_configs alter column locale set not null;
alter table public.country_configs alter column currency_symbol set not null;
alter table public.country_configs alter column enabled set default false;
alter table public.country_configs alter column enabled set not null;

create table if not exists public.country_territorial_levels (
 id bigint generated always as identity primary key,
 country_code text not null references public.country_configs(country_code) on delete cascade,
 level_key text not null,
 label text not null,
 plural_label text not null,
 level_order integer not null check (level_order > 0),
 is_locality boolean not null default false,
 created_at timestamptz not null default now(),
 unique(country_code,level_key)
);

create index if not exists idx_country_territorial_levels_country
 on public.country_territorial_levels(country_code,level_order);

alter table public.country_territorial_levels enable row level security;

drop policy if exists country_territorial_levels_public_read on public.country_territorial_levels;
create policy country_territorial_levels_public_read
 on public.country_territorial_levels for select to anon,authenticated
 using (exists(select 1 from public.country_configs c where c.country_code=country_territorial_levels.country_code and c.enabled=true));

insert into public.country_territorial_levels(country_code,level_key,label,plural_label,level_order,is_locality) values
('AO','province','Província','Províncias',1,false),('AO','municipality','Município','Municípios',2,false),('AO','commune','Comuna','Comunas',3,false),('AO','neighborhood','Bairro','Bairros',4,true),
('MZ','province','Província','Províncias',1,false),('MZ','district','Distrito','Distritos',2,false),('MZ','administrative_post','Posto Administrativo','Postos Administrativos',3,false),('MZ','locality','Localidade','Localidades',4,true),
('CV','island','Ilha','Ilhas',1,false),('CV','municipality','Concelho','Concelhos',2,false),('CV','parish','Freguesia','Freguesias',3,false),('CV','zone','Zona','Zonas',4,true),
('GW','region','Região','Regiões',1,false),('GW','sector','Sector','Sectores',2,false),('GW','section','Secção','Secções',3,false),('GW','tabanca','Tabanca','Tabancas',4,true),
('ST','district','Distrito','Distritos',1,false),('ST','autonomous_region','Região Autónoma','Regiões Autónomas',2,false),('ST','locality','Localidade','Localidades',3,true)
on conflict(country_code,level_key) do update set label=excluded.label,plural_label=excluded.plural_label,level_order=excluded.level_order,is_locality=excluded.is_locality;

alter table public.country_configs enable row level security;
drop policy if exists country_configs_public_read on public.country_configs;
create policy country_configs_public_read on public.country_configs for select to anon,authenticated using(enabled=true);
