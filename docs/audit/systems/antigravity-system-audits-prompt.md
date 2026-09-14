# Anti-Gravity prompt — Grammar + Story SYSTEM deep audits

Copy everything below the line to Anti-Gravity.

---

## Two deep audits, markdown only, no code changes

The owner has round-2 bugs after the games-v3 implementation and has decided two of them are SYSTEM-level gaps that need a deep audit and redesign proposal, not spot fixes. You audit both; ZCode audits in parallel; the owner approves the merged redesign before anything is implemented.

### Audit 1 — the GRAMMAR system → write §4 of `docs/audit/systems/GRAMMAR_SYSTEM.md`

Read the file first: §0 lists every surface in scope, §1 has the owner's symptoms, §3 the prior art in this repo. Then audit the grammar SYSTEM end to end:

- **Generation depth:** `supabase/functions/enrich-unit` grammar_rules prompt — does it ask for enough to teach from (rule + why-line + ≥3 examples + per-example checks)? Does `generate-exercises` cover GRAMMAR_FILL per unit (the micro-quiz's fuel)?
- **Transform pairs:** the owner's core complaint — "How often do you brush your hair?" → "I never brush my hair before bed" reads as randomly matched. Is the content model capable of showing the CONNECTION (subject shift you→I, question word → frequency word)? What fields would it need (before/after highlight spans, rule linkage)?
- **Board flow:** Grammar Sandbox (the teaching moment) vs Grammar Lab / Grammar Forge (practice) — is the arc presentation → guided practice → production actually teachable in a live class? What should each surface do?
- **Student app:** `apps/student/SoloLessonPlayer.tsx` grammar step (micro-quiz pattern, commit 9f4a9e2) — the owner says it's "still not perfect" there too. What's missing?

**Deliverable in §4:** (a) gap analysis vs ESL best practice for 6–12 y/o; (b) a concrete redesign proposal — the teaching arc per surface, the content fields the generator must emit, and what changes where. Be specific enough that an engineer could scope it.

### Audit 2 — the STORY system + presenter coupling → write §4 of `docs/audit/systems/STORY_SYSTEM.md`

Read the file first (§0 scope, §1 the owner's symptoms including the missing-story-before-comprehension bug, a page with no image, and the zoom request). The owner's strategic ask: **couple Story Quest with the story presenter** (the reading-theater pattern on the board, and the student app has its own story presentation) instead of separate-feeling surfaces.

Audit:
- The data chain (story_pages → scene art → comprehension items) — where can it produce "question with no story" or "page with no image"? Hunt for MORE such failure modes across units.
- The presentation surfaces (board: Story Stage ×2 builds, Story Quest, Comic Panels, Story Sequencing; student: the story step) — duplication, inconsistency, missing shared presenter contract.
- The coupling proposal: what exactly should be shared (component contract, data shape, UX pattern) between board and student story surfaces — and what stays device-specific.

**Deliverable in §4:** (a) bug hunt results beyond the known three; (b) the coupling proposal with a concrete presenter contract.

### Rules
- Write ONLY into §4 of each file. Markdown only. No code, no git, no deploys.
- Ground every claim in the actual repo files (cite paths + line numbers like your games-v3 audits did).
- The owner reads in plain English — keep the summaries readable, put the depth below them.
- Report when BOTH §4 sections are written.
