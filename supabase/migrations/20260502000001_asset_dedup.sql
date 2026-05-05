ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_content_hash ON public.assets(content_hash)
WHERE content_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_hash_type_unique ON public.assets(content_hash, type)
WHERE content_hash IS NOT NULL;

ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS prompt_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_prompt_hash ON public.assets(prompt_hash)
WHERE prompt_hash IS NOT NULL;
