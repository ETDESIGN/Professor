import React from 'react';
import { ErrorBoundary } from '../../../../components/shared/ErrorBoundary';
import BoardMediaPlayer from '../../../board/templates/BoardMediaPlayer';
import BoardFocusCards from '../../../board/templates/BoardFocusCards';
import BoardStoryStage from '../../../board/templates/BoardStoryStage';
import BoardDialogueStage from '../../../board/templates/BoardDialogueStage';
import BoardGrammarSandbox from '../../../board/templates/BoardGrammarSandbox';
import BoardGrammarForge from '../../../board/templates/BoardGrammarForge';
import BoardTeamBattle from '../../../board/templates/BoardTeamBattle';
import BoardIntroSplash from '../../../board/templates/BoardIntroSplash';
import BoardUnscramble from '../../../board/templates/BoardUnscramble';
import BoardWhatsMissing from '../../../board/templates/BoardWhatsMissing';
import BoardSpeedQuiz from '../../../board/templates/BoardSpeedQuiz';
import BoardGameArena from '../../../board/templates/BoardGameArena';
import BoardStorySequencing from '../../../board/templates/BoardStorySequencing';
import BoardISayYouSay from '../../../board/templates/BoardISayYouSay';
import BoardLiveClassWarmup from '../../../board/templates/BoardLiveClassWarmup';
import BoardUnitSelection from '../../../board/templates/BoardUnitSelection';
import BoardWheelOfDestiny from '../../../board/templates/BoardWheelOfDestiny';
import BoardFlashMatch from '../../../board/templates/BoardFlashMatch';
import BoardListenTap from '../../../board/templates/BoardListenTap';
import BoardGrammarLab from '../../../board/templates/BoardGrammarLab';
import BoardWordDetective from '../../../board/templates/BoardWordDetective';
import BoardSoundLab from '../../../board/templates/BoardSoundLab';
import BoardStoryQuest from '../../../board/templates/BoardStoryQuest';
import BoardSentenceLab from '../../../board/templates/BoardSentenceLab';
import BoardPhonicsArena from '../../../board/templates/BoardPhonicsArena';
import BoardVocabBlitz from '../../../board/templates/BoardVocabBlitz';
import BoardMemoryLab from '../../../board/templates/BoardMemoryLab';
import BoardClassRally from '../../../board/templates/BoardClassRally';
import BoardFastVocab from '../../../board/templates/BoardFastVocab';

// Mirrors the render switch in apps/board/ClassroomBoard.tsx, which is the
// source of truth per supabase/functions/_shared/flowTypes.ts. Every type in
// SUPPORTED_FLOW_TYPES must have an entry here, or slides of that type fall
// through to the "Unknown Slide Type" fallback and look broken in the Live
// Commander preview. Aliases:
//   GAME_ARENA      -> BoardGameArena (NOT SpeedQuiz — fixed; was mislabeled)
//   SPEAKING        -> BoardISayYouSay (shared listen/repeat board)
//   SCRAMBLE        -> BoardUnscramble (legacy type name)
//   MAGIC_EYES      -> BoardWhatsMissing mode='magic_eyes' (consolidated,
//                      architecture §6.2 — one shell, two modes)
const BoardMagicEyesAlias: React.FC<any> = (props) => <BoardWhatsMissing {...props} mode="magic_eyes" />;
const BoardWhatsMissingDefault: React.FC<any> = (props) => <BoardWhatsMissing {...props} mode="whats_missing" />;
const BOARD_MAP: Record<string, React.FC<any>> = {
  INTRO_SPLASH: BoardIntroSplash,
  MEDIA_PLAYER: BoardMediaPlayer,
  LIVE_WARMUP: BoardLiveClassWarmup,
  FOCUS_CARDS: BoardFocusCards,
  GAME_ARENA: BoardGameArena,
  STORY_STAGE: BoardStoryStage,
  DIALOGUE_STAGE: BoardDialogueStage,
  GRAMMAR_SANDBOX: BoardGrammarSandbox,
  GRAMMAR_PRACTICE: BoardGrammarForge,
  TEAM_BATTLE: BoardTeamBattle,
  UNSCRAMBLE: BoardUnscramble,
  SCRAMBLE: BoardUnscramble,
  WHATS_MISSING: BoardWhatsMissingDefault,
  SPEED_QUIZ: BoardSpeedQuiz,
  STORY_SEQUENCING: BoardStorySequencing,
  I_SAY_YOU_SAY: BoardISayYouSay,
  SPEAKING: BoardISayYouSay,
  MAGIC_EYES: BoardMagicEyesAlias,
  WHEEL_OF_DESTINY: BoardWheelOfDestiny,
  FLASH_MATCH: BoardFlashMatch,
  LISTEN_TAP: BoardListenTap,
  GRAMMAR_LAB: BoardGrammarLab,
  WORD_DETECTIVE: BoardWordDetective,
  SOUND_LAB: BoardSoundLab,
  STORY_QUEST: BoardStoryQuest,
  SENTENCE_LAB: BoardSentenceLab,
  PHONICS_ARENA: BoardPhonicsArena,
  VOCAB_BLITZ: BoardVocabBlitz,
  MEMORY_LAB: BoardMemoryLab,
  CLASS_RALLY: BoardClassRally,
  FAST_VOCAB: BoardFastVocab,
  UNIT_SELECTION: BoardUnitSelection,
};

export const BoardRenderer: React.FC<{ currentStep: any }> = ({ currentStep }) => {
  const BoardComponent = BOARD_MAP[currentStep.type];

  if (BoardComponent) {
    if (currentStep.type === 'UNIT_SELECTION') {
      return <BoardComponent />;
    }
    return (
      <ErrorBoundary>
        <BoardComponent data={currentStep.data} />
      </ErrorBoundary>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-white bg-slate-900">
      <div className="text-2xl font-bold mb-2">Unknown Slide Type</div>
      <div className="font-mono text-slate-500">{currentStep.type}</div>
    </div>
  );
};
