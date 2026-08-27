# 11 — Unitization, Vocabulary Series & Class Plans (Brainstorm)

> **Status:** OPEN FOR DISCUSSION — 2026-08-27. No implementation until the owner signs off on the decision points (§6).
> **Trigger:** owner test of the full 26-page Power Up 2 sample (3 units in one PDF) exposed three structural gaps that span the whole product, not one feature.
> **Companion:** doc 10 (book-fidelity principles — verbatim, teacher sovereignty, no quotas) governs everything here too.

---

## 0. The three problems, as observed

1. **One PDF contained three units — the system made one.** After OCR, all 26 pages landed in a single system unit. The book's units are cleanly separated ("A day on the farm", "My week", plus Welcome pages). The system should propose the split and let the teacher confirm, edit, or override (doc 10 §5 already decided this shape: *auto-split proposal with teacher confirmation by default; manual assignment always available* — it was deferred from P2 and is now blocking real books).
2. **Vocabulary series are merged.** A unit holds distinct series (Countryside: mountain, tractor, leaves…; Routines: get up, wake up, wash your teeth…; Weather…). Today they all land in one flat 35–60-word pool. Kids must never receive all of them at once — release happens **by series**.
3. **A unit spans 2–6 classes.** The teacher teaches pages 16–17 of a 16–20 unit on a given day; that day's board, student app, and homework must show only that slice — not the whole unit's vocabulary/grammar dumped together. The teacher must be able to split the unit into N classes at planning time.

These are one architecture, not three features: **Book → Units → (Vocabulary series) → Classes → Live session.**

## 1. What already exists and carries this (no rework needed)

| Signal | Where it lives today |
|---|---|
| Printed unit label + page number per page | `book_pages.printed_unit_label`, `printed_page_number` (scanned on every page) |
| Unit opener identity (number + title) | `mission_opener` structures (`data.printed_unit_number`, `data.printed_title`) |
| Lesson headers ("Vocabulary 2 and song", "Language practice 1") | vocab sets' `set_label` / `lesson_header`; page labels |
| Series membership of every word | basket items + `vocabulary_items.set_label` + `source_structure_id` (page-scoped) |
| Page ↔ unit assignment is a plain column | `book_pages.unit_id` (teacher-sovereign reassignment; unassign never deletes) |
| Everything else (grammar, story, dialogues, songs) is page-scoped | `page_structures` → page → unit |

In other words: the **data model is already page-centric** — splitting, merging, and slicing are reassignments and scoping, never re-extraction.

## 2. Design A — Unitization (PDF → N units)

**Flow:** upload → scan (into a staging draft) → **unitization review** → pages distributed to final units → per-unit enrichment as today.

- **Proposal generation (deterministic, no AI):** group consecutive pages by `printed_unit_label` / mission-opener boundaries; openers start a new group; unlabelled pages join the preceding group; Welcome/appendix pages (no unit label, no opener) are proposed as **book-level "class setup" material** (doc 10 §5 decision — recorded on the book, never feeds units/pools).
- **Teacher UI (the sovereignty point):** a boundary editor — one row per proposed unit with its page range, title (default = opener's printed title), and actions: merge with previous, split at page, move page, rename. Plus the standing manual mode: ignore proposals, assign pages by hand.
- **Mechanics:** creating N units = N `units` rows + one `UPDATE book_pages SET unit_id` per group. Enrichment, pools, flows all follow automatically because everything hangs off pages. Re-running unitization later (teacher reorganizes) reassigns and re-enriches idempotently (vocabulary dedupe is per-unit, so moves are safe).
- **Edge cases:** spread pages (opener on 18, content on 19) stay in one group (consecutive grouping handles it); books with no labels at all → manual mode (doc 10: books without clean unit structures are first-class); pages from different books in one unit (doc 10 §11) — unchanged, teacher decides.

## 3. Design B — Vocabulary series as first-class learning groups

**Principle: a series is the unit of release, never the whole vocabulary pool.**

- **Identity:** series = the vocab-set structure (`set_label` + page). Missing label → derived, editable: "Set 2 · page 11". Teacher can rename labels in review (small ✎ addition — needs a per-structure label editor).
- **Persistence:** `vocabulary_items.set_label` already written at enrichment. Add `set_order` (position of the set within the unit, from page order) so series have a canonical teaching sequence even when labels are fuzzy.
- **Grouping everywhere:** Content vault + review show words **grouped by series**; pools/SRS carry `set_label` so any consumer can filter; mastery progress per series ("Countryside 8/11") rather than one wall of 40 words.
- **Release model for kids:** the student app receives series progressively — gated by the class plan (Design C), not by time: a series becomes available to a student when its class is taught (or when the teacher marks it released). Within a class, multiple series may be active; the SRS interleaves them but never reaches beyond the released set.

## 4. Design C — Class plans (unit → N classes)

**The new object: a Class Plan = a scoped slice of a unit, with its own flow.**

- **Table (proposal):** `class_plans (id, unit_id, order_index, title, date?, scope)` where `scope` is a JSONB page-range + exceptions: `{ "pages": [16, 17], "include_structure_ids": [...], "exclude_structure_ids": [...] }`. Page-range as the base unit keeps every content type sliceable by the same rule; exceptions give surgical control.
- **Proposal generation (deterministic):** lesson headers / LP markers / set boundaries on pages suggest natural cut points ("LP1 pages 6–11", "Song + LP2 pages 10–13", "Review 15–17"). Teacher sets the number of classes OR drags cut points; both stay in sync. A 2-class teacher and a 6-class teacher slice the same unit differently — same data.
- **What a class plan drives:**
  1. **Live teaching:** opening a class loads a flow generated from that class's scope only (the whole-unit flow we build today becomes the *preview*; each class gets its own — `class_plans.flow`).
  2. **Student app:** the day's class defines which series/grammar/story are released (Design B's gate).
  3. **Homework/assignments:** an assignment attaches to a class plan, not the unit.
- **Relationship to today's flow:** `units.flow` remains the unit-level plan; class flows are derived views (regenerable). Nothing existing breaks.

## 5. Phasing (each independently shippable)

- **F1 — Unitization.** Scan-side signals exist; needs the staging flow + boundary editor UI + page reassignment. *Unblocks every real book.*
- **F2 — Series-aware vocabulary.** Grouping UI, label editing, `set_order`, pools/SRS tagged with `set_label`. *Unblocks sane vocab learning.*
- **F3 — Class plans.** New table, proposal + editor UI, class-scoped flow generation, student-app release gate. *The largest piece; depends on F1/F2 for clean scoping.*

Story illustrations + the "From the book" panel (paused 2026-08-27) slot in alongside F2 — both are consumption surfaces over the same page-scoped data.

## 6. Decision points — OWNER ANSWERS LOCKED 2026-08-27

| # | Question | Decision |
|---|---|---|
| 1 | Unitization timing | **Automatic at the scan step, teacher corrects immediately** — AND re-editable later at any time from planning (e.g. after teaching one or two classes, the teacher can re-split; changes re-flow idempotently). |
| 2 | Welcome/class-setup pages | **Optionally attachable to a class** (book-level storage by default; the chant can join a class when the teacher wants it). |
| 3 | Series editing | **Rename labels only** for now. Full word-moving between series is a much-later future item (recorded, not scheduled). |
| 4 | Class scope definition | **Page ranges with exceptions** (survives re-scans). |
| 5 | Student release | **Strictly class-gated** first — the simple model. Teacher pre-release of a series is a later, post-MVP option. |
| 6 | Class dates | **Order-only** for v1; calendar dates later. |

### Still open (asked 2026-08-27) — ANSWERED same day

| # | Question | Decision |
|---|---|---|
| 7 | Enrichment trigger after unitization confirm | **Enrich-on-open (cost-conscious, teacher control).** Created units sit as ready-but-unenriched drafts; enrichment runs when the teacher opens each unit's review — not automatically in the background. |
| 8 | Spaced review composition | **Split by surface.** The **student app** gets the reinforcement/SRS layer (class-gated new content + spaced review of previously released material — the app decides when old words resurface). The **LiveBoard is strictly the current class's material, teacher-driven** — no review interleave; the teacher's limited class time is never spent on old words. |

All eight decisions locked. Implementation proceeds per fixplan (FIXPLAN G for F1), each phase gated on owner approval.

## 7. What we are explicitly NOT doing (yet)

- No auto-detection of "pedagogical rhythm" beyond printed labels (doc 10 §5: the book's rhythm is deliberately not modeled — LP markers are *labels*, not authority).
- No changes to the student SRS algorithm itself — only what it's fed.
- No multi-book classroom logistics (which class of which teacher gets which book) — that's roster/school territory.
