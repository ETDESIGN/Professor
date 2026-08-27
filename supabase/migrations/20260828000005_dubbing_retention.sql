-- 20260828000005_dubbing_retention.sql
-- Task 11 (video-dubbing): weekly retention cleanup for dubbings + their audio blobs.
--
-- Policy:
--   * unpublished drafts expire after 90 days
--   * published dubbings expire 365 days after publication
--
-- Blob cleanup: a dub's audio lives in the `dubbing-media` storage bucket; the
-- object paths are the values of `dubbings.line_audio` (jsonb, full path incl.
-- folders, no bucket prefix — see 20260828000002 line 52 and the parent-erase
-- policy in 20260828000004). Deleting rows alone would orphan the blobs, and a
-- cron SQL job CAN safely remove them by deleting the matching storage.objects
-- rows (standard Supabase pattern), so the job deletes blobs FIRST, then rows.
--
-- pg_cron is available on this project (verified via pg_available_extensions,
-- not previously installed); it creates its own `cron` schema. We schedule a
-- weekly job that calls a SECURITY DEFINER function so the cleanup runs with
-- elevated rights regardless of the cron role's search_path/permissions.

create extension if not exists pg_cron;

create or replace function public.dubbing_cleanup()
returns integer
language plpgsql
security definer
set search_path = public, extensions, storage
as $$
declare
  v_deleted integer;
begin
  -- Supabase blocks direct DELETEs on storage.objects via the
  -- storage.protect_delete() trigger; setting this GUC (transaction-scoped)
  -- is the documented escape hatch that lets the job remove blobs.
  perform set_config('storage.allow_delete_query', 'true', true);

  -- 1) Remove the audio blobs referenced by expiring rows (blobs first, then
  --    rows, so we never orphan objects or delete objects still referenced).
  delete from storage.objects
   where bucket_id = 'dubbing-media'
     and name in (
       select e.value  -- jsonb_each_text already yields text
         from public.dubbings d
         cross join jsonb_each_text(d.line_audio) as e
        where (not d.is_published and d.created_at < now() - interval '90 days')
           or (d.is_published and d.published_at < now() - interval '365 days')
     );

  -- 2) Remove the expired dubbing rows.
  delete from public.dubbings
   where (not is_published and created_at < now() - interval '90 days')
      or (is_published and published_at < now() - interval '365 days');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Weekly, Sunday 03:00 UTC.
select cron.schedule(
  'dubbing-retention',
  '0 3 * * 0',
  $job$ select public.dubbing_cleanup(); $job$
);
