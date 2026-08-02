# Tasks 10–13 — Re-wire Grammar / Story / Dialogue+Cast / Media+Settings+Questions sub-tabs onto the store

> **These are 4 tasks but one document** — they're structurally identical to Task 09 (Vocabulary). Read Task 09 first; it's the template. Apply the SAME pattern to each remaining sub-tab. Commit **one task per commit** (so a regression in one doesn't block the others).

## The pattern (repeat for each sub-tab)
Replace local `useState` with the store; remove the sub-tab's DB fetch from the vault's `useEffect` (the store loads it once); leave call-site logic unchanged. The store setters all accept updater functions, so existing `setX(prev => ...)` and `setX([...x, new])` calls work unchanged.

## Task 10 — Grammar sub-tab
- Scope: `apps/teacher/UnitContentVault.tsx` (Grammar sub-tab)
- Replace: `const [grammarRules, setGrammarRules] = useState<GrammarRule[]>([])` → store
- Store API: `useUnitStudioStore(s => s.grammarRules)` / `s.setGrammarRules`
- Remove the grammar-specific `grammar_rules` fetch from the vault's `useEffect`
- Acceptance: mirror Task 09's (read from store, call sites unchanged, fetch removed, save persists, typecheck/build clean, manual edit-verify)

## Task 11 — Story sub-tab
- Scope: `apps/teacher/UnitContentVault.tsx` (Story sub-tab)
- Replace: `const [storyPages, setStoryPages] = useState<StoryPage[]>([])` → store
- Store API: `useUnitStudioStore(s => s.storyPages)` / `s.setStoryPages`
- Remove the story-specific `story_pages` fetch from the vault's `useEffect`
- Same acceptance criteria as Task 09

## Task 12 — Dialogue + Cast sub-tabs
- Scope: `apps/teacher/UnitContentVault.tsx` (the Cast/characters section; Dialogue if present)
- The Cast section uses `linkedChars` / `loadLinkedCharacters` (separate from the store's content). **Leave `linkedChars` as-is for now** — character linking has its own service (`CharacterService`) and isn't part of the store's content categories. Only re-wire content fields that the store owns.
- If the Dialogue sub-tab has local state mirroring a store category, re-wire it. If it reads from the manifest directly (no local state), leave it for now (the store doesn't yet own a `dialogue` array — that's a future task).
- Acceptance: typecheck/build clean; no regression in the Cast picker; manual edit-verify on whatever you re-wired

## Task 13 — Media + Settings + Questions sub-tabs + remove vault's save button
- Scope: `apps/teacher/UnitContentVault.tsx` (Media sub-tab, Settings sub-tab, Questions sub-tab)
- Media: `mediaStep` → `useUnitStudioStore(s => s.mediaStep)` / `s.setMediaStep`
- Settings: `manifest` → `useUnitStudioStore(s => s.manifest)` / `s.setManifest`
- Questions: `questions` → `useUnitStudioStore(s => s.questions)` / `s.setQuestions`
- Remove the remaining category-specific fetches from the vault's `useEffect`
- **Remove the vault's own [Save] button** (the one in the vault header). Saving now happens via the Unit Studio header (Task 14). The vault is `embedded` in the Studio, so its own save button is redundant. Keep the "Publish & Teach" button for now (Task 14 decides its fate) — actually, **read Task 14 before removing anything**; coordinate so the Studio header save exists before the vault's is removed. If Task 14 isn't done yet, leave the vault's save button and just re-wire the state — note in STATUS that the button removal is deferred to Task 14.
- Acceptance: typecheck/build clean; no orphaned state; manual edit-verify on each re-wired category

## Global rules (all 4 tasks)
- **One commit per task** (10, 11, 12, 13 each get their own commit). Don't bundle.
- **Stay in scope** — only the named sub-tab(s) per task.
- **Don't change the store** (`store/useUnitStudioStore.ts`) — it's the stable contract.
- **Don't change UI** — only the state source.
- **Self-verify each** against Task 09's acceptance criteria (adapted to the category) before marking review.
- **Fill the STATUS section** at the bottom of THIS file for each task (10/11/12/13), noting the commit hash.

## References
- `qoder_tasks/09_rewire_vocab_subtab.md` (the template — read first)
- `store/useUnitStudioStore.ts` (the contract)
- `apps/teacher/UnitContentVault.tsx`
- `qoder_tasks/07_design_decisions.md` §B (the architecture)

---

## STATUS

### Task 10 (Grammar)
- [x] acceptance criteria met
- **Commit:** (see git log)
- **Notes:** Grammar sub-tab reads `grammarRules`/`setGrammarRules` from the store. Local `interface GrammarRule` removed (imported from store). Grammar fetch removed from loadUnit(). All grammar call sites (inline onChange handlers in the grammar sub-tab JSX) use `setGrammarRules(newRules)` pattern which works with the store's setter. Typecheck + build clean.

### Task 11 (Story)
- [ ] acceptance criteria met
- **Commit:** _pending_
- **Notes:**

### Task 12 (Dialogue + Cast)
- [ ] acceptance criteria met
- **Commit:** _pending_
- **Notes:**

### Task 13 (Media + Settings + Questions + save button)
- [ ] acceptance criteria met
- **Commit:** _pending_
- **Notes:**
