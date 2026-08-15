# Unit & Book Manager — Brainstorm & Decision Record

> **Date:** 2026-08-07 · **Status:** Decisions locked → implementation plan follows
> **Participants:** Owner + agent (brainstorm session)
> **Scope rule (owner):** *least perturbation into the existing system during implementation.*

---

## 1. How we got here

While verifying the content pipeline (`pool_items` / `generate-exercises`) for the
new-gen game system, we found **74 units in the DB** although the owner had deleted
all units from the test-teacher frontend. Investigation results:

- **The deletes actually worked.** Hard `DELETE` on `units` by id (`supabaseDeleteUnit`).
- Test account `caneles2hk@gmail.com` (`01326490…`) owns **1 unit**.
- The other **73 units belong to `etiawork@gmail.com`** (`49665afa…`, an older dev
  account; units created Apr 1–May 16, 2026). **Decision: leave them** — addressed
  in another session.

### Real problems surfaced (grounded in schema/RLS queries)

| # | Finding | Evidence |
|---|---|---|
| 1 | **RLS hole on units:** DELETE/UPDATE policies only check `is_teacher_or_admin()` — any teacher can delete/modify ANY unit | `pg_policies` on `units` (SELECT correctly scopes `teacher_id = auth.uid()`) |
| 2 | **Same leak on books:** DELETE/UPDATE = `owner_id = auth.uid() OR is_teacher_or_admin()` | `pg_policies` on `books` |
| 3 | **No soft delete** — hard delete, no trash, no recovery | no `deleted_at` on `units`/`books` |
| 4 | **No cascade cleanup** — deleting a unit orphans 18 tables referencing `unit_id` (content: objectives, pool_items, vocabulary_items, grammar_rules, story_pages, dialogue_lines, unit_characters, unit_media, story_comprehension_questions, character_ledger, content_review_status, assets, generation_jobs; history: classroom_sessions, class_session_occurrences, assignments, llm_telemetry) | `information_schema` |
| 5 | **Book level half-integrated:** `books` table + `units.book_id` exist, auto "My Units" book per teacher + "Legacy Units" catch-all (owner NULL), `UploadTextbook` assigns `book_id` — but **zero UI exposure** (UnitList is a flat grid) | DB + code grep |
| 6 | **Inconsistent statuses:** `Active` (13), `Draft` (60), `published` (1, lowercase), `Completed` | `units.status` distribution |
| 7 | **Org foundation exists but unused:** `schools`, `school_memberships` (request/approval workflow), `classes.school_id`, `user_role` includes `manager` — all 0 rows | DB |

---

## 2. Locked decisions

1. **Book = folder / reference work.** Books classify units; the teacher always sees
   which book a unit belongs to, including units under no specific book
   ("Unassigned" section).
2. **Teacher-owned books only, for now.** `books.owner_id` = creator. **School
   ownership (`books.school_id`), school library, manager console: deferred** —
   judged unnecessary complexity at this stage.
3. **Upload stays unit-by-unit.** Each upload lands in a book (default "My Units" or
   a selected book). **Full-book upload with AI unit detection/splitting: later.**
4. **Move units between books: included** (it's a simple `book_id` update).
5. **Reordering: minimal now** — `units.order_index` + simple up/down controls in the
   book view. Polished drag-and-drop: later.
6. **Soft delete + Trash** — `deleted_at` on units and books; Trash view with
   restore; permanent delete cascades content tables via one RPC.
7. **Status normalization** — canonical lifecycle; fix lowercase `published`.
8. **Pipeline-aware status badges** — reflect enrichment job state + pool readiness.
9. **RLS ownership fix** — units DELETE/UPDATE require `teacher_id = auth.uid()` or
   admin; books policies tightened to owner-or-admin only. The **book becomes the
   access boundary** for its units.
10. **Shared-unit editing (future sharing phase): Option A** — shared books are
    *use as-is*; customizing requires an explicit **"Duplicate to my library"**.
    Per-teacher override layer (Option B) is the documented evolution path, not now.
11. **Sharing design is brainstormed but all UI deferred.** The `book_grants`
    **schema only** is created now so later phases are additive (no migration churn).
12. **73 orphan units: leave untouched.**

---

## 3. Sharing model brainstorm (future phase — recorded for continuity)

**Core principle: share links, not copies.** Sharing grants access to the same living
book (owner updates propagate to everyone). Teachers who want to customize use an
explicit **"Duplicate to my library"** fork.

**Permission ladder:** VIEW (preview) → TEACH (launch live, assign to classes) →
EDIT (modify units/plans) → MANAGE (share/transfer/delete). Owner ⇒ MANAGE.

**Three ownership shapes (eventual):**
1. Personal — `owner_id = teacher` (today, unchanged).
2. Shared — owner keeps ownership; access via explicit user grants.
3. School book — *deferred*: recommended design is `books.school_id` (institutional
   ownership surviving staff turnover; managers manage via
   `school_memberships.role = 'manager'`), **not** the manager's personal account.

**Data model (schema lands now, UI later):**
```
book_grants (
  id, book_id,
  grantee_type  'user' | 'school',
  grantee_id,
  permission    'view' | 'teach' | 'edit' | 'manage',
  granted_by, created_at, revoked_at   -- soft revoke
)
Access check: owner → MANAGE, else highest of direct user grant or grants to any
school the user is an ACTIVE member of (SECURITY DEFINER function).
```

**Flows it will unlock:** teacher→teacher share dialog (same-school search +
permission pick, "Shared with me" tab); manager oversight (managers auto-VIEW books
owned by their school's members); manager→school publishing (school grant → "School
library" tab for all members); future full-book AI upload lands as school/teacher
book-first (PDF → AI splits units → ordered book).

**Known design trap (decided):** shared units' lesson plans live on the unit row —
a TEACH-level teacher must not silently edit the owner's plan. Option A (use as-is +
duplicate) resolves it for v1.

---

## 4. Converged scope

| Now (this implementation) | Later (deferred, documented) |
|---|---|
| RLS ownership fix (units + books) | Teacher↔teacher share dialog UI |
| Soft delete + Trash + cascade RPC | Manager console + school library UI |
| Status normalization + pipeline-aware badges | School ownership (`books.school_id`) |
| Bookshelf → Book → ordered units UI | Full-book AI upload & unit splitting |
| Book CRUD + custom books + move units between books | Drag-and-drop reorder polish |
| `units.order_index` + up/down reorder | Student-side book journey |
| Upload book selector (default-preserving) | Progress rollups (book-level) |
| `book_grants` table (schema only) | Per-teacher unit overrides (Option B) |

---

## 5. Pipeline context recorded the same session

- `pool_items`: 70 rows, all from **one** unit (`e432361f…`); `generate-exercises`
  works (job succeeded) but historically ran only there. 73/74 units have no pool —
  new-gen games show their empty states on them until pools are generated.
- That unit also lacks grammar objectives and TTS audio → grammar/listening exercise
  types missing. Enrichment completeness drives pool completeness.
- The 9 new-gen board games are pool-driven and fully deployed (see
  `MASTER_ROADMAP.md`); their visibility in lessons comes from the Plan Composer
  library (done) and future auto-generation (Phase 3, pending discussion).

---

## 6. Implementation & verification log (2026-08-07)

### Delivered (per the approved plan)
- **Migrations (all applied via Management API + recorded in schema_migrations):**
  - `20260807000001_unit_book_manager.sql` — deleted_at/order_index columns,
    book_grants (schema-only), RLS ownership fixes, status normalization,
    `delete_unit_full` / `delete_book_full` / `is_book_owner`.
  - `20260807000002_trash_listing_rpcs.sql` — `list_trashed_units` /
    `list_trashed_books` (SECURITY DEFINER; SELECT policies hide trashed rows).
  - `20260807000003_trash_restore_rpcs.sql` — `trash_unit` / `restore_unit` /
    `trash_book` / `restore_book` (bugfix RPCs, see below).
- **Services:** `services/BookService.ts` extended (books CRUD, move/reorder,
  trash/restore, pipeline meta); `services/SupabaseService.ts` Engine wrappers;
  `Engine.deleteUnit` switched to soft delete; `LessonUnit` carries
  `book_id`/`order_index`.
- **Library UI:** `apps/teacher/UnitList.tsx` rebuilt — Library/Trash tabs,
  bookshelf → book detail, pipeline-aware badges (Draft/Enriching/Ready·N),
  up/down reorder, move-to-book, create/rename/trash books, restore +
  delete-forever with confirmations.
- **Upload:** `apps/teacher/UploadTextbook.tsx` book selector bar
  (default-preserving: “My Units (default)”), units land in the chosen book
  with next order_index.
- **Infra bugfix (surfaced by verification):** Vercel rewrites pointed at
  `*.html` destinations which conflict with `cleanUrls: true` → every SPA deep
  link 404'd (masked previously by the PWA navigateFallback). `vercel.json`
  rewrites now target clean paths (`/teacher`, `/student`, …); verified 200.

### Bugs found during browser verification (test account caneles2hk) and fixed
1. **RLS soft-delete failure** — direct PostgREST UPDATE of `deleted_at` fails
   (“new row violates row-level security policy”) because the SELECT policy
   filters `deleted_at IS NULL`; restore was equally impossible (trashed rows
   invisible). Fixed via SECURITY DEFINER trash/restore RPCs (migration 3).
2. **SPA deep-link 404s** — see infra bugfix above.

### Verification evidence (production, professor-ruby.vercel.app)
- tsc + vite build clean; 3 production deploys; RLS policy quals confirmed via
  `pg_policies`; all RPCs present via `pg_proc`.
- Browser (browser-use) as the test teacher:
  - Bookshelf renders: Legacy Units (SHARED, read-only) + My Units; Trash tab.
  - Book detail: ordered units, badges (DRAFT / ENRICHING / READY·27/28/70),
    up/down arrows with correct disabled ends, kebab menu
    (Plan/Edit · Review Content · Move to book… · Move to Trash).
  - Move to Trash → toast + DB `deleted_at` set; Trash tab lists it; Restore →
    DB `deleted_at` null again.
  - New Book “Test Book Alpha” created (DB row); unit moved into it (DB
    `book_id` changed) and back; book trashed + deleted forever (DB row gone).
  - Delete forever on a unit with content → DB cascade confirmed:
    unit row 0, pool_items 27→0, objectives 3→0, generation_jobs 1→0.
  - Reorder → contiguous `order_index` persisted (0,1,2,3).
  - Upload page book selector renders with preserved default.
- Cleanup: all test artifacts removed (test book deleted, unit restored).
- Durable snapshot: `docs/brainstorming/VERIFICATION_LIBRARY_BOOKSHELF_SNAPSHOT.txt`
  (the browser-use screenshot tool timed out repeatedly in this environment;
  a11y snapshot captured instead).
