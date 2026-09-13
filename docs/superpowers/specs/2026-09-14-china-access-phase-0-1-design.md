# China Access — Phase 0/1 Design (2026-09-14)

**Problem.** The app is deployed on Vercel (`professor-ruby.vercel.app`) with Supabase Mumbai (`xsdnzijketjnzhakqtit.supabase.co`). Testing students (10–20), their phones, and their parents' phones are in mainland China without VPNs. Four independent GFW blockers:

1. `*.vercel.app` — blocked via SNI filtering + DNS pollution (Vercel KB confirms; no China PoPs, no guarantee possible).
2. `*.supabase.co` — GFW-degraded; REST mostly limps, **Realtime websockets time out intermittently** (supabase-flutter #1054 etc.). Live classroom sessions depend on realtime.
3. `fonts.googleapis.com` — **render-blocking `<link>` in `index.html`** hung the page before the app even loaded. Google is fully blocked in China.
4. `api.dicebear.com` — 23 fallback `<img>` URLs across student/board/parent/teacher surfaces rendered as broken images.

Also blocked for CN users regardless of hosting: YouTube video streams (`googlevideo.com`) — see Open decisions. Stripe checkout + Sentry ingest are CN-unreliable (future workstream, not Phase 0/1).

**Constraint.** The only guaranteed fix is mainland hosting, which requires an ICP license (mainland legal entity or Chinese ID; weeks). Not feasible now → serve from outside the mainland on unflagged custom domains over routes the GFW tolerates. Rejected for now: Cloudflare free (no mainland PoPs without Enterprise+ICP), full China mirror (data split, double ops), paid China-delivery vendors (overkill at this scale).

**Plan (approved by owner 2026-09-14):** Phase 0 (code, this changeset) → Phase 1 (custom domain, owner buys; test with students) → Phase 2 (HK CN2-GIA reverse proxy for app+API+realtime+storage) only if Phase 1 disappoints.

## Phase 0 — implemented 2026-09-14

### Fonts (self-hosted, zero bytes leave our origin)
- Removed the `fonts.googleapis.com` `<link>` from `index.html`.
- Added `@fontsource` imports at the top of `src/index.css` (the one CSS all 5 entries import): Fredoka 400–700, Inter 400–900, Rubik 400–900 + italic 700/900, Nunito Sans 400–800 + italic 400, JetBrains Mono 700/800 (exact parity with the old link, plus JBM which 10 board templates reference but only 2 loaded). 125 woff2 files bundle + hash into `dist/assets`.
- Removed the two runtime Google-Fonts injections (`useV3Fonts` in `BoardFocusCards.tsx`, `BoardWordSearch.tsx`).
- **Noto Sans SC is NOT bundled**: CJK glyphs now come from device-native fonts via the Tailwind `cn` stack (`PingFang SC` / `Hiragino Sans GB` / `Microsoft YaHei` / `MiSans`). Shipping Noto Sans SC would push megabytes over CN mobile networks for near-identical rendering.

### Placeholder art (local, deterministic)
- New pure helper `services/localArt.ts` (+ `test/localArt.test.ts`): `fallbackCover(seed)` / `fallbackAvatar(seed)` → `/art/cover-{0-5}.svg` / `/art/avatar-{0-3}.svg` (FNV-1a hash mod N); `coverOrFallback` / `avatarOrFallback` render-time guards that pass real URLs through and swap null/**legacy persisted dicebear/pollinations** URLs; `MASCOT_ART`, `CHEST_ART`.
- 12 hand-drawn flat SVGs in `public/art/` (6 pastel covers, 4 avatar silhouettes, robot mascot, treasure chest) — same pastel palette the dicebear URLs used.
- All 23 `api.dicebear.com` call sites replaced (student: ListenTap, SentenceScramble, HomeMap, WordLab, SoloLessonPlayer; board: BoardUnitSelection, BoardFocusCards; parent: ParentApp/Dashboard/Settings/Reports/Messages; teacher: dashboards, settings ×3, TeacherMessages ×3, UnitPreviewModal, UnitContentVault ×2, CharacterPickerModal, PlanComposer; services: LessonTransformer, SupabaseService, AIService).

### Deliberately KEPT dicebear as a *marker* (not a display dep)
Edge functions (`enrich-unit`, `generate-lesson`, `_shared/illustration|imageGen|classFlow`) and `store/useUnitStudioStore.ts` still **write** dicebear URLs as "placeholder, heal me" markers: the image-generation pipeline pattern-matches `dicebear|pollinations` to decide what to regenerate (`MediaService.needsImage`, `isRealImage` guards). Changing those writes to `/art/…` would make placeholders look "real" and stop the healing flywheel. Instead, **every render site now guards** via `coverOrFallback`/`avatarOrFallback`, so no `<img>` ever fetches api.dicebear. When real images land they win.

### Verification
`tsc --noEmit` clean · 835/835 vitest (2 LessonTransformer tests updated to the local-art contract) · `vite build` clean · dist audit: 125 woff2 bundled, `/art/*` present, zero `fonts.googleapis` requests, no dicebear fetch in client JS (the only remaining string is the store's marker write, guarded at every render).

## Phase 1 — custom domain (owner actions + agent actions)

1. **Owner:** buy a domain (`.com`/`.app`/`.io`; NOT `.cn` — needs mainland real-name + presence). Any registrar; Cloudflare Registrar or Namecheap fine. Tell the agent the domain name.
2. **Agent:** add domain to Vercel project `professor` (`prj_hOjuQO5tlDSTS0PGEDxOCTzFLcPg`) via REST API.
3. **Owner DNS** (agent provides exact records): `A @ 76.76.21.21` (or CNAME `www → cname.vercel-dns.com`) + per-subdomain CNAMEs for the 4 portals (`teacher/student/parent/admin` — Vercel rewrites serve them; verify against `vercel.json` rewrites).
4. **Supabase custom domain** (`db.<domain>` via Supabase Custom Domains, needs Pro plan — check current plan; if free, owner decides $25/mo upgrade or skip and test app-domain-only first), then `VITE_SUPABASE_URL` swap in Vercel env + Supabase Auth redirect URLs update.
5. **Test with students for ~1 week**: no VPN, phone + parent phone, classroom hours AND evening. Success = page loads + login + lesson playable; realtime sync quality is the thing to watch.

**If Phase 1 disappoints (likely for evening use): Phase 2** — HK VPS (CN2 GIA, ~$8–15/mo) running Caddy/Nginx: `app.<domain>` → Vercel, `db.<domain>` → Supabase (REST + auth + storage + edge + realtime ws upgrade). One env var flips the client (`VITE_SUPABASE_URL=db.<domain>`). Known wrinkle: storage signed URLs returned by edge functions must also come back on `db.<domain>` (public-URL env pattern) — design detail for the Phase 2 spec.

## Open decisions (owner)
- **YouTube songs for CN students**: teacher-device playback vs cache song audio in our storage vs China-friendly source (Bilibili embeds). Not addressed in Phase 0/1 — video streams come from `googlevideo.com` and cannot be fixed by proxying our own app.
- Sentry DSN + Stripe: deferred until China is a real business line (Alipay/WeChat Pay, not Stripe, for CN parents).
