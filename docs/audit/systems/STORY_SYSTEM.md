# Story System — Deep Audit & Presenter Coupling (round 2, 2026-09-15)

> **Status:** IN PROGRESS — ZCode §0–§3 + Anti-Gravity §4 (quality opinion + coupling proposal). Owner approves the synthesis BEFORE implementation.

## §0 Scope — the whole story chain, board + student
- **Data:** `story_pages` (text, speaker, image_asset_id, extractor_version, status) · `scene_illustrations` (paragraph anchors, per-paragraph crops) · objectives type=story · STORY_COMPREHENSION pool items · the scan → enrich → publish pipeline that produces them
- **Board surfaces:** `BoardStoryStage.tsx` + `BoardStoryStage.ag.tsx` (reading theater presenter) · `BoardStoryQuest.tsx` (read + comprehension) · `BoardComicPanels.tsx` (comics presenter — panel crops from book pages) · `BoardStorySequencing` (shared askedComprehensionItems coordination with Story Stage)
- **Student app:** the story step in `SoloLessonPlayer.tsx` (and any story/comics presenter under `apps/student/`)
- **The coupling question (owner):** Story Quest should be coupled with the story presenter (the reading-theater / comics-presenter pattern) — on the board AND the student app — instead of being a separate-feeling surface. What exactly to share (components, data, UX) is what this audit decides.

## §1 Owner symptoms & requests (verbatim intent)
- "First, it seems there is no story, and then there is a screen with a question: 'What does the text remind us to do when we exercise?' The questions are good, but we didn't see any text or story." (#7)
- "Story Quest: one page with text but no image — is it normal? Needs checking." (#12)
- "Add a zoom option on images — tap or corner button to show the image big." (#13)
- "After seeing the student app, I believe we need to couple Story Quest with the story presenter — we have one on the student side too. I figured out some little bugs, so I'd like a deep audit of the story system to see if there are extra bugs we didn't think about."

## §2 ZCode factual findings (code-derived; to be completed during the audit)
- (to be filled — why a unit can reach comprehension with zero story pages; which page lost its image; zoom absence; student-side story step inventory; data-health stats across units)

## §3 Prior art
- Story Stage reading theater (both builds, live as STORY_STAGE + STORY_STAGE_AG) — the presenter pattern to couple TO.
- Comics pipeline: per-paragraph scene anchors + panel crops (`docs/audit/games-v3/28-comic-panels.md`, scan-v8).

## §4 ⬜ Anti-Gravity — quality opinion + coupling proposal
*(AG writes here: analysis of the story experience across surfaces, the bug hunt beyond the known symptoms, and a concrete coupling proposal — what the presenter contract should be, shared between board and student. Markdown only, no code.)*

## §5 ⬜ Synthesis → owner approval
