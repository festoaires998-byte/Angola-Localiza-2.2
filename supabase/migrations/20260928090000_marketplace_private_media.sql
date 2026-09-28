insert into storage.buckets (id,name,public,allowed_mime_types,file_size_limit)
values ('marketplace-media','marketplace-media',false,array['image/jpeg','image/png','image/webp'],5242880)
on conflict (id) do update set public=false,allowed_mime_types=excluded.allowed_mime_types,file_size_limit=excluded.file_size_limit;

drop policy if exists "Marketplace imagens próprias" on storage.objects;
create policy "Marketplace imagens próprias"
on storage.objects for select to authenticated
using (
 bucket_id='marketplace-media'
 and (
   (storage.foldername(name))[1]=(select auth.uid())::text
   or exists (
     select 1 from public.marketplace_listing_images i
     join public.marketplace_listings l on l.id=i.listing_id
     where i.storage_path=name and l.status='ACTIVE'
       and l.country_code=(select country_code from public.user_country_profiles where user_id=auth.uid())
   )
   or public.is_admin(auth.uid())
 )
);