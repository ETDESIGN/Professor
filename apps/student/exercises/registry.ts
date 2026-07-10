// ExerciseRegistry (Track B student-app instance). Registers the 12 Core-v1
// components on the shared {data, onComplete, onError} contract. The
// dispatcher (ExerciseRunner) renders by PoolItem.exercise_type.

import { createExerciseRegistry, ExerciseRegistry, ExerciseType } from '../../../types/exercise';
import ChoiceExercise from './ChoiceExercise';
import WordBankBuild from './WordBankBuild';
import Dictation from './Dictation';
import TypeTranslate from './TypeTranslate';
import MinimalPairSwipe from './MinimalPairSwipe';
import SpeakSentence from './SpeakSentence';

let registry: ExerciseRegistry | null = null;

/** Lazily-built singleton registry (idempotent registration). */
export function getExerciseRegistry(): ExerciseRegistry {
  if (registry) return registry;
  registry = createExerciseRegistry();

  // The 7 multiple-choice types share one flexible component.
  const choiceTypes: ExerciseType[] = [
    'IMAGE_SELECT',
    'MEANING_MATCH',
    'AUDIO_L1_SELECT',
    'LISTEN_SELECT',
    'SPELL_CLOZE',
    'ERROR_SPOT',
    'TRANSFORM',
  ];
  for (const t of choiceTypes) registry.register(t, ChoiceExercise as any);

  registry.register('WORD_BANK_BUILD', WordBankBuild as any);
  registry.register('DICTATION', Dictation as any);
  registry.register('TYPE_TRANSLATE', TypeTranslate as any);
  registry.register('MINIMAL_PAIR_SWIPE', MinimalPairSwipe as any);
  registry.register('SPEAK_SENTENCE', SpeakSentence as any);

  return registry;
}
