create table if not exists public.marketplace_categories (
 id uuid primary key default gen_random_uuid(),
 slug text unique not null,
 name text not null,
 icon text,
 active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);

insert into public.marketplace_categories(slug,name,icon,sort_order) values
('veiculos','Veículos','🚗',10),('imoveis','Imóveis','🏠',20),('eletronica','Eletrónica','📱',30),
('casa','Casa','🏡',40),('moda','Moda','👕',50),('empregos','Empregos','💼',60),
('servicos','Serviços','🛠️',70),('agricultura','Agricultura','🌱',80),('animais','Animais','🐕',90),
('outros','Outros','📦',100) on conflict(slug) do nothing;

alter table public.marketplace_listings add column if not exists condition text;
alter table public.marketplace_listings add column if not exists province text;
alter table public.marketplace_listings add column if not exists city text;
alter table public.marketplace_listings add column if not exists neighborhood text;
alter table public.marketplace_listings add column if not exists contact_phone boolean not null default false;
alter table public.marketplace_listings add column if not exists contact_message boolean not null default true;
alter table public.marketplace_listings add column if not exists views_count integer not null default 0;
alter table public.marketplace_listings drop constraint if exists marketplace_listings_status_check;
alter table public.marketplace_listings add constraint marketplace_listings_status_check check(status in ('DRAFT','ACTIVE','PAUSED','ARCHIVED'));
alter table public.marketplace_listings drop constraint if exists marketplace_listings_condition_check;
alter table public.marketplace_listings add constraint marketplace_listings_condition_check check(condition is null or condition in ('NEW','USED','REFURBISHED'));

create table if not exists public.marketplace_listing_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,listing_id)
);
create table if not exists public.marketplace_listing_interests (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
 interested_user_id uuid not null references auth.users(id) on delete cascade,
 seller_id uuid not null references auth.users(id) on delete cascade,
 message text not null check(length(trim(message)) between 1 and 1000),
 status text not null default 'OPEN' check(status in ('OPEN','CLOSED')),
 created_at timestamptz not null default now()
);
alter table public.marketplace_categories enable row level security;
alter table public.marketplace_listing_favorites enable row level security;
alter table public.marketplace_listing_interests enable row level security;
drop policy if exists "Marketplace categorias públicas" on public.marketplace_categories;
create policy "Marketplace categorias públicas" on public.marketplace_categories for select to authenticated using(active=true or public.is_admin(auth.uid()));
drop policy if exists "Marketplace favoritos próprios" on public.marketplace_listing_favorites;
create policy "Marketplace favoritos próprios" on public.marketplace_listing_favorites for select to authenticated using(user_id=auth.uid());
drop policy if exists "Marketplace interesses envolvidos" on public.marketplace_listing_interests;
create policy "Marketplace interesses envolvidos" on public.marketplace_listing_interests for select to authenticated using(interested_user_id=auth.uid() or seller_id=auth.uid() or public.is_admin(auth.uid()));
revoke insert,update,delete on public.marketplace_categories from anon,authenticated;
revoke insert,update,delete on public.marketplace_listing_favorites from anon,authenticated;
revoke insert,update,delete on public.marketplace_listing_interests from anon,authenticated;
create index if not exists marketplace_listing_category_idx on public.marketplace_listings(country_code,category,status,created_at desc);
create index if not exists marketplace_listing_location_idx on public.marketplace_listings(country_code,province,city,status);
create index if not exists marketplace_favorites_user_idx on public.marketplace_listing_favorites(user_id,created_at desc);
create index if not exists marketplace_interests_seller_idx on public.marketplace_listing_interests(seller_id,status,created_at desc);