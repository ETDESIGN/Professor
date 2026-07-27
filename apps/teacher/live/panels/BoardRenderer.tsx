import React from 'react';
import { ErrorBoundary } from '../../../../components/shared/ErrorBoundary';
import BoardMediaPlayer from '../../../board/templates/BoardMediaPlayer';
import BoardFocusCards from '../../../board/templates/BoardFocusCards';
import BoardStoryStage from '../../../board/templates/BoardStoryStage';
import BoardGrammarSandbox from '../../../board/templates/BoardGrammarSandbox';
import BoardGrammarPractice from '../../../board/templates/BoardGrammarPractice';
import BoardTeamBattle from '../../../board/templates/BoardTeamBattle';
import BoardIntroSplash from '../../../board/templates/BoardIntroSplash';
import BoardUnscramble from '../../../board/templates/BoardUnscramble';
import BoardWhatsMissing from '../../../board/templates/BoardWhatsMissing';
import BoardSpeedQuiz from '../../../board/templates/BoardSpeedQuiz';
import BoardGameArena from '../../../board/templates/BoardGameArena';
import BoardStorySequencing from '../../../board/templates/BoardStorySequencing';
import BoardISayYouSay from '../../../board/templates/BoardISayYouSay';
import BoardLiveClassWarmup from '../../../board/templates/BoardLiveClassWarmup';
import BoardMagicEyes from '../../../board/templates/BoardMagicEyes';
import BoardUnitSelection from '../../../board/templates/BoardUnitSelection';
import BoardPoll from '../../../board/templates/BoardPoll';
import BoardWheelOfDestiny from '../../../board/templates/BoardWheelOfDestiny';
import BoardFlashMatch from '../../../board/templates/BoardFlashMatch';
import BoardListenTap from '../../../board/templates/BoardListenTap';

// Mirrors the render switch in apps/board/ClassroomBoard.tsx, which is the
// source of truth per supabase/functions/_shared/flowTypes.ts. Every type in
// SUPPORTED_FLOW_TYPES must have an entry here, or slides of that type fall
// through to the "Unknown Slide Type" fallback and look broken in the Live
// Commander preview. Aliases:
//   GAME_ARENA      -> BoardGameArena (NOT SpeedQuiz — fixed; was mislabeled)
//   SPEAKING        -> BoardISayYouSay (shared listen/repeat board)
//   SCRAMBLE        -> BoardUnscramble (legacy type name)
const BOARD_MAP: Record<string, React.FC<any>> = {
  INTRO_SPLASH: BoardIntroSplash,
  MEDIA_PLAYER: BoardMediaPlayer,
  LIVE_WARMUP: BoardLiveClassWarmup,
  FOCUS_CARDS: BoardFocusCards,
  GAME_ARENA: BoardGameArena,
  STORY_STAGE: BoardStoryStage,
  GRAMMAR_SANDBOX: BoardGrammarSandbox,
  GRAMMAR_PRACTICE: BoardGrammarPractice,
  TEAM_BATTLE: BoardTeamBattle,
  UNSCRAMBLE: BoardUnscramble,
  SCRAMBLE: BoardUnscramble,
  WHATS_MISSING: BoardWhatsMissing,
  SPEED_QUIZ: BoardSpeedQuiz,
  STORY_SEQUENCING: BoardStorySequencing,
  I_SAY_YOU_SAY: BoardISayYouSay,
  SPEAKING: BoardISayYouSay,
  MAGIC_EYES: BoardMagicEyes,
  POLL: BoardPoll,
  WHEEL_OF_DESTINY: BoardWheelOfDestiny,
  FLASH_MATCH: BoardFlashMatch,
  LISTEN_TAP: BoardListenTap,
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
