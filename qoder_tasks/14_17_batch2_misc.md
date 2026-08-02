# Tasks 14–17 — Unified save, MediaPicker invocations, unit_media wiring

> Four independent tasks in one doc (each gets its own commit). 14 depends on 09-13. 16-17 are independent and can run in parallel with the sub-tab re-wires.

## Task 14 — Single [Save] action in the Unit Studio header
**Depends on:** 09-13 (sub-tabs re-wired to the store).

### What to change
- `apps/teacher/UnitStudio.tsx` — add a [Save] button to the Studio header (next to the title/tabs). It calls `useUnitStudioStore(s => s.save)`. Show a spinner + disable while `s.saving`. Disable when `s.dirty.size === 0` ("Nothing to save" tooltip). On success, a toast fires (the store already toasts).
- Remove any redundant save buttons that now exist (the vault's own save — by Task 13 it should be gone; if not, remove it here). Keep "Publish & Teach" but re-point it to: `save()` then navigate to `/teacher/live` (it currently does its own save + orchestrate; consolidate so save goes through the store).
- Add a small "edited" indicator (a dot or asterisk next to the title) when `s.dirty.size > 0`, so the teacher knows there are unsaved edits. Clear it when `dirty` is empty (after save).

### Acceptance Criteria
- [ ] One [Save] button in the Studio header calls the store's `save()`
- [ ] Disabled/spinner state reflects `saving` + `dirty.size === 0`
- [ ] "Edited" indicator shows when dirty
- [ ] No other save buttons remain in the embedded vault
- [ ] "Publish & Teach" goes through `store.save()` before launching live
- [ ] typecheck + build clean
- [ ] Manual: edit a vocab word + a grammar rule, click the header Save ONCE → both persist + exercises reconcile

## Task 16 — Wire MediaPickerModal into 4 more fields
**Independent of 09-14.** The picker (`apps/teacher/MediaPickerModal.tsx`) is built + reusable but only invoked from the vocab image field today.

### What to change
Add a "Library" button (mirror the vocab image one at `UnitContentVault.tsx:663-664, 996-1008`) next to each of these fields, opening `<MediaPickerModal kind="..." ...>` and applying the selected asset's URL:
- **Story page image** (`UnitContentVault.tsx` Story sub-tab, ~line 744 — currently a bare URL input) → `kind="image"`, set the page's `imageUrl`.
- **Character portrait** (in `CharacterPickerModal.tsx` or the character card) → `kind="image"`, set a portrait. (Note: the character library stores `reference_image_asset_id`, not a URL — for now, set the manifest `image_url` and flag in STATUS that the asset_id link is a future task.)
- **Song** (Media sub-tab) → `kind="audio"` (or `video` if it's a video song). Currently YouTube search + paste-URL. Add a "Pick from library" button alongside.
- **Video** (Media sub-tab) → `kind="video"`. Currently paste-URL + record-as-asset. Add "Pick from library".

For each: the picker's `onSelect(asset)` should set the relevant field. Use the EXISTING vocab-image wiring as the reference pattern.

### Acceptance Criteria
- [ ] 4 new "Library"/"Pick from library" buttons, each opening MediaPickerModal with the right `kind`
- [ ] Selecting an asset applies its URL to the field
- [ ] No regression in the existing vocab-image picker
- [ ] typecheck + build clean
- [ ] Manual: open each field's picker, select an asset, confirm the field updates

## Task 17 — Wire `unit_media` writes into imageGen.ts / tts.ts (Phase 1.6 finish)
**Independent.** `unit_media` (the many-to-many vault join) has 0 rows because no producer writes it. The migration (`20260730000006_unit_media_and_assets.sql`) deferred producer-wiring to Phase 1.6, which was skipped.

### What to change
- `supabase/functions/_shared/imageGen.ts` — when inserting an `assets` row (line ~87-101), ALSO upsert a `unit_media` row linking the asset to the unit with a `role`. The `role` isn't always knowable at image-gen time (imageGen doesn't know if it's a vocab image vs a story illustration). **Decision:** use a generic role `'generated'` for now (the vault UI can refine later). The upsert: `unit_media(unit_id, asset_id, role)` ON CONFLICT do nothing. Pass the `unitId` you already have.
- `supabase/functions/_shared/tts.ts` — when audio is uploaded to storage (line ~52-58), insert the `assets` row (currently tts writes NOTHING to `assets` — that's a gap) AND the `unit_media` link. Role `'audio'`. The asset `type` is `'audio'`.
- Note: tts.ts currently returns the URL without recording an asset. Add the asset insert (best-effort, non-fatal) + the unit_media link. This also makes audio appear in the vault (currently the vault is images-only because tts never recorded).

### Acceptance Criteria
- [ ] imageGen.ts writes a `unit_media` row (role 'generated') alongside each asset insert
- [ ] tts.ts now inserts an `assets` row (type 'audio') + a `unit_media` link (role 'audio') on TTS generation
- [ ] Errors are logged, not swallowed (don't fail generation if the link write fails)
- [ ] Re-deploy generate-exercises, generate-media, enrich-unit (all import imageGen/tts)
- [ ] After re-deploy, trigger a generation and verify `unit_media` + `assets` (audio) rows appear
- [ ] typecheck clean (this is edge code — ignore Deno/esm noise as usual)

## References
- `store/useUnitStudioStore.ts` (Task 14 contract)
- `apps/teacher/UnitContentVault.tsx:663-664, 996-1008` (the vocab-image picker pattern to mirror in Task 16)
- `apps/teacher/MediaPickerModal.tsx` (the reusable picker)
- `supabase/functions/_shared/imageGen.ts`, `_shared/tts.ts` (Task 17)
- `supabase/migrations/20260730000006_unit_media_and_assets.sql` (the unit_media schema)

---

## STATUS

### Task 14 (Unified save)
- [x] acceptance criteria met
- **Commit:** (see git log)
- **Notes:** Studio header now has [Save] + [Publish & Teach] buttons calling `store.save()`. Save is disabled when `dirty.size === 0` (tooltip: "Nothing to save") and shows spinner while saving. Amber dot indicator next to title when dirty. "Publish & Teach" calls `store.save()` then navigates to `/teacher/live` on success. Vault's Save + Publish buttons hidden when `embedded` (kept for standalone use). Re-enrich button stays in the vault header. Typecheck + build clean.

### Task 16 (MediaPicker 4 fields)
- [ ] acceptance criteria met
- **Commit:** _pending_
- **Notes:**

### Task 17 (unit_media wiring)
- [ ] acceptance criteria met
- **Commit:** _pending_
- **Notes:**
