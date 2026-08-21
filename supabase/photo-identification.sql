-- Run this once in Supabase SQL Editor to enable “Can't find the part? Upload a photo”.
-- The bucket is private: only SK Traders staff can review uploaded photos in Supabase Storage.

create table if not exists public.part_photo_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) >= 2),
  phone text not null check (char_length(trim(phone)) >= 8),
  scooter_details text,
  note text,
  image_path text not null,
  status text not null default 'new' check (status in ('new', 'reviewing', 'identified', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.part_photo_requests enable row level security;
drop policy if exists "anyone can create part photo requests" on public.part_photo_requests;
drop policy if exists "staff can manage part photo requests" on public.part_photo_requests;
create policy "anyone can create part photo requests" on public.part_photo_requests for insert to anon, authenticated with check (true);
create policy "staff can manage part photo requests" on public.part_photo_requests for all using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('part-photos', 'part-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "anonymous uploads part photos" on storage.objects;
drop policy if exists "staff can access part photos" on storage.objects;
create policy "anonymous uploads part photos" on storage.objects for insert to anon, authenticated
with check (bucket_id = 'part-photos' and (storage.foldername(name))[1] = 'anonymous');
create policy "staff can access part photos" on storage.objects for all using (bucket_id = 'part-photos' and public.is_staff()) with check (bucket_id = 'part-photos' and public.is_staff());
