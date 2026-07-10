// ChoiceExercise — renders the 7 multiple-choice Core-v1 types from one
// flexible component (they share the "pick one option, reveal, complete"
// interaction). The discriminated content supplies the prompt shape + options.
//
// Handles: IMAGE_SELECT, MEANING_MATCH, AUDIO_L1_SELECT, LISTEN_SELECT,
// SPELL_CLOZE, ERROR_SPOT, TRANSFORM.

import React, { useState } from 'react';
import { BaseExerciseProps, ExerciseContent } from '../../../types/exercise';
import {
  AudioButton,
  FeedbackBanner,
  useElapsedMs,
  optionClasses,
  Feedback,
} from './shared';

const CHOICE_TYPES = new Set([
  'IMAGE_SELECT',
  'MEANING_MATCH',
  'AUDIO_L1_SELECT',
  'LISTEN_SELECT',
  'SPELL_CLOZE',
  'ERROR_SPOT',
  'TRANSFORM',
]);

export function isChoiceType(type: string): boolean {
  return CHOICE_TYPES.has(type);
}

const ChoiceExercise: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const c = data.content as ExerciseContent;
  const elapsed = useElapsedMs();
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback>('idle');

  // Extract fields per content shape.
  const t = c.type;
  let promptText = '';
  let promptAudio: string | undefined;
  let sentencePrompt = '';
  let instruction = '';
  let explanation: string | undefined;
  let audioButton = false;
  let imageOptions = false;
  let optionsRaw: any[] = [];
  let correctIndex = 0;

  switch (t) {
    case 'IMAGE_SELECT':
      promptText = c.prompt;
      promptAudio = c.prompt_audio;
      optionsRaw = c.options;
      correctIndex = c.correct_index;
      imageOptions = true;
      break;
    case 'MEANING_MATCH':
      promptText = c.prompt;
      promptAudio = c.prompt_audio;
      optionsRaw = c.options;
      correctIndex = c.correct_index;
      break;
    case 'AUDIO_L1_SELECT':
      promptAudio = c.audio_url;
      optionsRaw = c.options;
      correctIndex = c.correct_index;
      audioButton = true;
      promptText = 'Listen and choose the correct meaning';
      break;
    case 'LISTEN_SELECT':
      promptAudio = c.audio_url;
      optionsRaw = c.options;
      correctIndex = c.correct_index;
      audioButton = true;
      imageOptions = c.options?.some((o: any) => o?.image_url);
      promptText = 'Listen and tap the correct answer';
      break;
    case 'SPELL_CLOZE':
      sentencePrompt = c.sentence_with_blank;
      optionsRaw = c.options;
      correctIndex = c.correct_index;
      promptAudio = c.audio_url;
      break;
    case 'ERROR_SPOT':
      sentencePrompt = c.sentence;
      optionsRaw = c.options;
      correctIndex = c.correct_index;
      explanation = c.explanation;
      instruction = 'Choose the correct version';
      break;
    case 'TRANSFORM':
      sentencePrompt = c.prompt_sentence;
      instruction = c.instruction;
      optionsRaw = c.options;
      correctIndex = c.correct_index;
      break;
    default:
      return <div className="p-6 text-slate-400">Unsupported exercise.</div>;
  }

  const handleSelect = (i: number) => {
    if (feedback !== 'idle') return;
    setSelected(i);
    const correct = i === correctIndex;
    setFeedback(correct ? 'correct' : 'wrong');
    setTimeout(() => {
      onComplete({ success: correct, time_taken_ms: elapsed(), attempts: 1 });
    }, 1100);
  };

  return (
    <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full">
      {/* Prompt */}
      <div className="mb-4">
        {audioButton ? (
          <div className="flex items-center gap-4">
            <AudioButton url={promptAudio} fallbackText={promptText} large onError={onError} />
            {promptText && <span className="text-slate-500 font-bold">{promptText}</span>}
          </div>
        ) : null}

        {!audioButton && promptAudio ? (
          <div className="flex items-center gap-3 mb-2">
            {promptText && <h2 className="text-3xl font-black text-slate-800">{promptText}</h2>}
            <AudioButton url={promptAudio} fallbackText={promptText} onError={onError} />
          </div>
        ) : null}

        {!audioButton && !promptAudio && promptText ? (
          <h2 className="text-3xl font-black text-slate-800">{promptText}</h2>
        ) : null}

        {instruction && <p className="text-duo-blue font-bold mt-1">{instruction}</p>}
        {sentencePrompt && (
          <p className="text-xl text-slate-700 font-medium mt-2 leading-relaxed">{sentencePrompt}</p>
        )}
      </div>

      {/* Options */}
      <div className={`grid gap-3 flex-1 content-start ${imageOptions ? 'grid-cols-2' : ''}`}>
        {optionsRaw.map((opt: any, i: number) => (
          <button
            key={i}
            onClick={() => handleSelect(i)}
            disabled={feedback !== 'idle'}
            className={`rounded-2xl font-bold text-left transition-all p-4 ${optionClasses(i, selected, correctIndex, feedback !== 'idle')}`}
          >
            {imageOptions && opt?.image_url ? (
              <div className="flex flex-col items-center gap-2">
                <img
                  src={opt.image_url}
                  alt={opt.label || ''}
                  className="w-full h-28 object-contain rounded-xl bg-white"
                  onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')}
                />
                {opt.label && <span>{opt.label}</span>}
              </div>
            ) : (
              <span>{typeof opt === 'string' ? opt : opt?.text || opt?.label || ''}</span>
            )}
          </button>
        ))}
      </div>

      {feedback !== 'idle' && explanation && (
        <p className="text-sm text-slate-500 mt-2">{explanation}</p>
      )}
      <FeedbackBanner feedback={feedback} />
    </div>
  );
};

export default ChoiceExercise;
