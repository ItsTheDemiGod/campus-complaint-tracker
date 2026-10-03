-- =====================================================================
-- 002_ticket_photos_and_realtime.sql
-- Phase 3: storage bucket for ticket photos + realtime on tickets.
-- Run in Supabase SQL Editor after 001 (see README.md).
-- =====================================================================

-- Public bucket (anyone with the URL can VIEW a photo; fine for this project),
-- 5 MB limit, images only. Uploads are controlled by the policy below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-photos', 'ticket-photos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Only logged-in users may upload, and only into a folder named after their own
-- user id (path = '<uid>/<file>'), so nobody can write into someone else's folder.
-- storage.foldername(name)[1] is the first path segment. No UPDATE/DELETE policies,
-- so uploaded photos cannot be overwritten or removed by users.
create policy "ticket-photos: authenticated upload to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ticket-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Realtime only broadcasts changes for tables in the supabase_realtime publication.
-- RLS still applies: each subscriber only receives rows they are allowed to SELECT.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;
end $$;
