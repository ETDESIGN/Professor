// services/assetCategory.ts
// Library classification (spec 2026-09-05 §3.3): categories are DERIVED from
// signals already stamped on assets — no new writes, no schema. Vocab assets
// get metadata {surface:'vocab', word_key} at generation + via the cleanup
// backfill; comics/panels/story carry metadata.pool; book extracts carry kind.
export type AssetCategory = 'vocabulary' | 'comics' | 'story' | 'characters' | 'audio' | 'video' | 'links' | 'other';

export const ASSET_CATEGORIES: readonly { id: AssetCategory; label: string }[] = [
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'comics', label: 'Comics & book art' },
  { id: 'story', label: 'Story art' },
  { id: 'characters', label: 'Portraits & covers' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'links', label: 'Links' },
  { id: 'other', label: 'Other' },
];

export function deriveAssetCategory(asset: {
  type: string;
  kind?: string | null;
  metadata?: Record<string, any> | null;
}): AssetCategory {
  const meta = asset.metadata || {};
  if (meta.surface === 'vocab') return 'vocabulary';
  if (meta.pool === 'scene') return 'story';
  if (meta.pool === 'panel' || asset.kind === 'book_extract') return 'comics';
  if (meta.surface === 'portrait' || meta.surface === 'cover') return 'characters';
  if (asset.type === 'audio') return 'audio';
  if (asset.type === 'video') return 'video';
  if (asset.kind === 'external_url') return 'links';
  return 'other';
}
