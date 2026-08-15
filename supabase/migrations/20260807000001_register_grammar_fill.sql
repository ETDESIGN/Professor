-- Register GRAMMAR_FILL (new-gen GRAMMAR_LAB rung-3 MCQ, MASTER_ROADMAP 2026-08-07)
-- in the activity type registry. generate-exercises' gate() filters emitted pool
-- items by this registry per learning_object_type; without this row the
-- GRAMMAR_FILL emission (added to buildGrammarItems) is silently dropped.
-- Dual-registration requirement: types/exercise.ts + _shared/exerciseTypes.ts
-- already declare the type; this completes the registry side.
INSERT INTO activity_type_registry (learning_object_type, activity_type, generator_key)
VALUES ('grammar', 'GRAMMAR_FILL', 'buildGrammarItems')
ON CONFLICT DO NOTHING;
