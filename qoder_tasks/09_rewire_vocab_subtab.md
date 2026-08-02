# Task 09 — Re-wire Vocabulary sub-tab onto useUnitStudioStore

## Context
Phase 2 unification (Task 07 design): the editor sub-tabs in UnitContentVault currently own their state via local `useState` + their own save logic. Task 08 created `useUnitStudioStore` (`store/useUnitStudioStore.ts`) — the single owner of unit + content + save/reconcile. This task re-wires the **Vocabulary sub-tab** to read/write the store instead of local state. It's the template for Tasks 10-13 (Grammar/Story/Dialogue+Cast/Media+Settings+Questions), which are structurally identical.

## Scope
- `apps/teacher/UnitContentVault.tsx` (the Vocabulary sub-tab's render + handlers)

**Do NOT touch:** the store itself (Task 08), other sub-tabs (separate tasks), PlanComposer, AssetWorkshop, the live session.

## What to change

The Vocabulary sub-tab currently reads `vocabulary` + `setVocabulary` from local `useState`. Replace with the store:
```ts
// OLD:
const [vocabulary, setVocabulary] = useState<VocabItem[]>([]);
// NEW:
import { useUnitStudioStore } from '../../store/useUnitStudioStore';
const vocabulary = useUnitStudioStore(s => s.vocabulary);
const setVocabulary = useUnitStudioStore(s => s.setVocabulary);
```

The store's `setVocabulary` accepts BOTH a value and an updater function `(prev) => next`, so existing call sites like `setVocabulary([...vocabulary, newItem])` and `setVocabulary(prev => prev.filter(...))` work unchanged. **Do not change the call sites' logic** — only the declaration source.

Also: the Vocabulary sub-tab's load currently comes from the vault's `useEffect` that fetches `vocabulary_items`. The store now owns the load (`store.load(unitId)`). So:
- Remove the vocabulary-specific fetch from UnitContentVault's `useEffect` (the store loads it).
- The vault should call `useUnitStudioStore(s => s.load)` once on mount (if the store hasn't loaded this unit yet) instead of fetching vocabulary itself. **Coordinate with the other sub-tab tasks:** only ONE mount-effect should call `store.load` — put it at the vault-component level (it loads ALL categories), not per sub-tab.

**Important — do NOT remove the vault's save button yet.** That's Task 13/14. For now, the vault's save still works (it reads the local state, which is now the store — so saving via the vault button and saving via the store both work). Task 14 removes the redundant button.

## Acceptance Criteria
- [ ] Vocabulary sub-tab reads `vocabulary` from `useUnitStudioStore`, not local `useState`
- [ ] All `setVocabulary` call sites work unchanged (the store accepts updater functions)
- [ ] The vocabulary-specific DB fetch is removed from the vault's `useEffect` (the store loads it)
- [ ] One `store.load(unitId)` call exists at the vault-component level (mount effect)
- [ ] Editing a vocab word + clicking the vault's Save still persists (proves the store is the source)
- [ ] `npx tsc --noEmit -p tsconfig.json` clean
- [ ] `npx vite build` succeeds
- [ ] **Manual verify:** open a unit, edit a vocab word, save — confirm the edit persisted (reload the unit; the edit is still there) AND `vocabulary_items` in the DB reflects it

## Don't
- Do NOT change the store (`store/useUnitStudioStore.ts`) — it's the stable contract.
- Do NOT touch Grammar/Story/Dialogue/Media/Settings/Questions sub-tabs — those are Tasks 10-13.
- Do NOT remove the vault's Save button (Task 14).
- Do NOT change the vocabulary UI (inputs, regenerate buttons, etc.) — only the state source.
- Do NOT add per-sub-tab `store.load` calls (one load at the vault level, period).

## References
- `store/useUnitStudioStore.ts` (the store API — your contract)
- `apps/teacher/UnitContentVault.tsx` (the file you're editing; vocab state ~line 58, sub-tab render further down)
- `qoder_tasks/07_design_decisions.md` §B (the unification architecture)
