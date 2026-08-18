// boardMap.tsx — THE single step-type → template map (FIXPLAN P3.8).
//
// Both render surfaces consume this map:
//   • apps/board/ClassroomBoard.tsx        (the projector)
//   • apps/teacher/live/panels/BoardRenderer.tsx (the commander preview)
//
// Previously two hand-mirrored switches "already caught drifting once"
// (commit a44e1bb: 6 unregistered slide types + GAME_ARENA aliased to the
// wrong game). One map, one place to register a new template.
//
// Every type in SUPPORTED_FLOW_TYPES (supabase/functions/_shared/flowTypes.ts)
// must have an entry here, or slides of that type fall through to the
// surface's fallback. Aliases below preserve legacy type names
// (SCRAMBLE → BoardUnscramble, MAGIC_EYES → BoardWhatsMissing mode, …).

import React from 'react';
import BoardMediaPlayer from './BoardMediaPlayer';
import BoardFocusCards from './BoardFocusCards';
import BoardStoryStage from './BoardStoryStage';
import BoardDialogueStage from './BoardDialogueStage';
import BoardGrammarSandbox from './BoardGrammarSandbox';
import BoardGrammarForge from './BoardGrammarForge';
import BoardTeamBattle from './BoardTeamBattle';
import BoardIntroSplash from './BoardIntroSplash';
import BoardUnscramble from './BoardUnscramble';
import BoardWhatsMissing from './BoardWhatsMissing';
import BoardSpeedQuiz from './BoardSpeedQuiz';
import BoardGameArena from './BoardGameArena';
import BoardStorySequencing from './BoardStorySequencing';
import BoardISayYouSay from './BoardISayYouSay';
import BoardLiveClassWarmup from './BoardLiveClassWarmup';
import BoardUnitSelection from './BoardUnitSelection';
import BoardWheelOfDestiny from './BoardWheelOfDestiny';
import BoardFlashMatch from './BoardFlashMatch';
import BoardListenTap from './BoardListenTap';
import BoardGrammarLab from './BoardGrammarLab';
import BoardWordDetective from './BoardWordDetective';
import BoardSoundLab from './BoardSoundLab';
import BoardStoryQuest from './BoardStoryQuest';
import BoardSentenceLab from './BoardSentenceLab';
import BoardPhonicsArena from './BoardPhonicsArena';
import BoardVocabBlitz from './BoardVocabBlitz';
import BoardMemoryLab from './BoardMemoryLab';
import BoardClassRally from './BoardClassRally';
import BoardFastVocab from './BoardFastVocab';
import BoardWordSearch from './BoardWordSearch';
import BoardSpellingBee from './BoardSpellingBee';

const BoardMagicEyesAlias: React.FC<any> = (props) => <BoardWhatsMissing {...props} mode="magic_eyes" />;
const BoardWhatsMissingDefault: React.FC<any> = (props) => <BoardWhatsMissing {...props} mode="whats_missing" />;

export const BOARD_MAP: Record<string, React.FC<any>> = {
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
  SCRAMBLE: BoardUnscramble, // legacy type name
  WHATS_MISSING: BoardWhatsMissingDefault,
  MAGIC_EYES: BoardMagicEyesAlias, // consolidated into BoardWhatsMissing (architecture §6.2)
  SPEED_QUIZ: BoardSpeedQuiz,
  STORY_SEQUENCING: BoardStorySequencing,
  I_SAY_YOU_SAY: BoardISayYouSay,
  SPEAKING: BoardISayYouSay,
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
  WORD_SEARCH: BoardWordSearch,
  SPELLING_BEE: BoardSpellingBee,
  UNIT_SELECTION: BoardUnitSelection, // rendered WITHOUT data (drives slides itself)
};
