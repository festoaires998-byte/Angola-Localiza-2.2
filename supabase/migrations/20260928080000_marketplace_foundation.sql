create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(), seller_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null references public.country_configs(country_code), title text not null, description text,
  category text not null, price numeric(14,2) not null check (price >= 0), currency text not null default 'AOA',
  quantity integer not null default 1 check (quantity >= 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','PAUSED','SOLD','ARCHIVED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.marketplace_listing_images (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, storage_path text not null,
  sort_order integer not null default 0 check (sort_order >= 0), created_at timestamptz not null default now(),
  unique(listing_id, storage_path)
);
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_listing_images enable row level security;
drop policy if exists "Marketplace público por país" on public.marketplace_listings;
create policy "Marketplace público por país" on public.marketplace_listings for select to authenticated
using ((status='ACTIVE' and country_code=(select country_code from public.user_country_profiles where user_id=auth.uid())) or seller_id=auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "Imagens dos próprios anúncios" on public.marketplace_listing_images;
create policy "Imagens dos próprios anúncios" on public.marketplace_listing_images for select to authenticated
using (owner_id=auth.uid() or exists(select 1 from public.marketplace_listings l where l.id=listing_id and l.status='ACTIVE' and l.country_code=(select country_code from public.user_country_profiles where user_id=auth.uid())) or public.is_admin(auth.uid()));
revoke insert,update,delete on public.marketplace_listings from anon,authenticated;
revoke insert,update,delete on public.marketplace_listing_images from anon,authenticated;
create index if not exists marketplace_listings_country_status_idx on public.marketplace_listings(country_code,status,created_at desc);
create index if not exists marketplace_listings_seller_idx on public.marketplace_listings(seller_id,status);
create index if not exists marketplace_images_listing_idx on public.marketplace_listing_images(listing_id,sort_order);