-- 20260905000001_word_images.sql
-- Per-teacher canonical word-image library (spec 2026-09-05
-- docs/superpowers/specs/2026-09-05-word-image-dedup-and-library-design.md):
-- ONE image per (owner, word_key), reused across ALL of that teacher's units.
-- Vocab-surface generation consults this before spending; a manual regenerate
-- replaces the pointer globally (the superseded asset is soft-deleted).
create table public.word_images (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  word_key   text not null,
  asset_id   uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, word_key)
);

comment on table public.word_images is 'Canonical per-teacher vocab image: word_key (lowercased/trimmed) -> asset. Consulted by generate-media/generate-exercises vocab paths before generation.';

alter table public.word_images enable row level security;

create policy word_images_owner_select on public.word_images
  for select to authenticated using (auth.uid() = owner_id);
create policy word_images_owner_insert on public.word_images
  for insert to authenticated with check (auth.uid() = owner_id);
create policy word_images_owner_update on public.word_images
  for update to authenticated using (auth.uid() = owner_id);

-- reverse lookups during cleanup + flashcard joins
create index word_images_asset_idx on public.word_images(asset_id);
