create table if not exists public.marketplace_listing_orders (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
 buyer_id uuid not null references auth.users(id) on delete restrict,
 seller_id uuid not null references auth.users(id) on delete restrict,
 country_code text not null references public.country_configs(country_code),
 currency text not null,
 quantity integer not null default 1 check(quantity>0 and quantity<=1000),
 unit_price numeric(14,2) not null check(unit_price>=0),
 total_amount numeric(14,2) generated always as (unit_price*quantity) stored,
 message text,
 status text not null default 'REQUESTED' check(status in ('REQUESTED','ACCEPTED','REJECTED','CANCELLED','COMPLETED')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 accepted_at timestamptz,
 completed_at timestamptz,
 cancelled_at timestamptz,
 check(buyer_id<>seller_id)
);
alter table public.marketplace_listing_orders enable row level security;
create policy "marketplace listing orders participants read" on public.marketplace_listing_orders for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid() or public.is_admin(auth.uid()));
revoke insert,update,delete on public.marketplace_listing_orders from anon,authenticated;
create index if not exists marketplace_listing_orders_buyer_idx on public.marketplace_listing_orders(buyer_id,status,created_at desc);
create index if not exists marketplace_listing_orders_seller_idx on public.marketplace_listing_orders(seller_id,status,created_at desc);
create index if not exists marketplace_listing_orders_listing_idx on public.marketplace_listing_orders(listing_id,status,created_at desc);
