import React from 'react';
import { ErrorBoundary } from '../../../../components/shared/ErrorBoundary';
import BoardMediaPlayer from '../../../board/templates/BoardMediaPlayer';
import BoardFocusCards from '../../../board/templates/BoardFocusCards';
import BoardStoryStage from '../../../board/templates/BoardStoryStage';
import BoardGrammarSandbox from '../../../board/templates/BoardGrammarSandbox';
import BoardTeamBattle from '../../../board/templates/BoardTeamBattle';
import BoardIntroSplash from '../../../board/templates/BoardIntroSplash';
import BoardUnscramble from '../../../board/templates/BoardUnscramble';
import BoardWhatsMissing from '../../../board/templates/BoardWhatsMissing';
import BoardSpeedQuiz from '../../../board/templates/BoardSpeedQuiz';
import BoardStorySequencing from '../../../board/templates/BoardStorySequencing';
import BoardISayYouSay from '../../../board/templates/BoardISayYouSay';
import BoardLiveClassWarmup from '../../../board/templates/BoardLiveClassWarmup';
import BoardMagicEyes from '../../../board/templates/BoardMagicEyes';
import BoardUnitSelection from '../../../board/templates/BoardUnitSelection';
import BoardPoll from '../../../board/templates/BoardPoll';
import BoardWheelOfDestiny from '../../../board/templates/BoardWheelOfDestiny';

const BOARD_MAP: Record<string, React.FC<any>> = {
  INTRO_SPLASH: BoardIntroSplash,
  MEDIA_PLAYER: BoardMediaPlayer,
  LIVE_WARMUP: BoardLiveClassWarmup,
  FOCUS_CARDS: BoardFocusCards,
  GAME_ARENA: BoardSpeedQuiz,
  STORY_STAGE: BoardStoryStage,
  GRAMMAR_SANDBOX: BoardGrammarSandbox,
  TEAM_BATTLE: BoardTeamBattle,
  UNSCRAMBLE: BoardUnscramble,
  WHATS_MISSING: BoardWhatsMissing,
  SPEED_QUIZ: BoardSpeedQuiz,
  STORY_SEQUENCING: BoardStorySequencing,
  I_SAY_YOU_SAY: BoardISayYouSay,
  MAGIC_EYES: BoardMagicEyes,
  POLL: BoardPoll,
  WHEEL_OF_DESTINY: BoardWheelOfDestiny,
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
