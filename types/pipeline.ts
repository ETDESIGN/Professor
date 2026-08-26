
// --- BOOK-FIDELITY EXTRACTION CONTRACT (FIXPLAN_F P1.2) ---
// Single source of truth: supabase/functions/_shared/bookScan.ts (pure TS,
// no Deno imports). This block replaced the dormant Jan-2026 zone model —
// `coordinates_hint` became literal normalized bboxes (doc 10 §2/§11).
export type {
  Bbox,
  StructureType,
  StructureData,
  VocabItem,
  VocabSetData,
  SpeechBubble,
  ComicPanel,
  ComicData,
  GrammarBoxData,
  SongActionLine,
  SongSheetData,
  ActivityRef,
  SceneIllustration,
  ReadingPassageData,
  PrintedActivityData,
  ReviewStatementsData,
  MissionOpenerData,
  CharacterAppearanceData,
  ClilPassageData,
  DialogueLineRef,
  DialogueSequenceData,
  RawStructure,
  VerifiedStructure,
} from '../supabase/functions/_shared/bookScan';
export { STRUCTURE_TYPES, EXTRACTOR_VERSION, VERIFICATION_FLAG, verifyStructures } from '../supabase/functions/_shared/bookScan';

// --- AGENT 2: PEDAGOGUE (The Brain) ---
export interface LearningObjective {
  primary_topic: string; // e.g. "Jungle Animals"
  grammar_focus?: string; // e.g. "Present Continuous (is running)"
  target_skills: ('LISTENING' | 'SPEAKING' | 'READING' | 'WRITING' | 'LOGIC')[];
  difficulty_cefr: 'Pre-A1' | 'A1' | 'A2' | 'B1';
  educational_goal: string; // e.g. "Student can describe animal actions."
}

// --- THEME CONTEXT (The World Binding) ---
export interface ThemeCharacter {
  name: string;
  role: string;
  emoji: string;
}

export interface ThemeContext {
  setting: string;
  characters: ThemeCharacter[];
  world_description: string;
}

// --- AGENT 3: ASSET CURATOR (The Producer) ---
export interface VocabAsset {
  word: string;
  definition: string;
  translation?: string;
  example_sentence?: string;
  context_sentence?: string;
  distractors: string[];
  image_prompt: string;
}

// Alias for consumers expecting RichVocabItem
export type RichVocabItem = VocabAsset;

export interface GrammarRuleAsset {
  rule: string;
  explanation: string;
  world_examples?: string[];
}

export interface AudioAsset {
  character_id: string;
  text: string;
  emotion: 'Happy' | 'Sad' | 'Angry' | 'Questioning';
  voice_id_suggestion?: string; 
}

export interface AssetManifest {
  vocabulary_enhancements: VocabAsset[];
  audio_production_queue: AudioAsset[];
  background_image_prompt: string;
}

// --- AGENT 4: GAME MECHANIC (The Developer) ---
export type GameEngineType = 'LOGIC_LABYRINTH' | 'SENTENCE_FACTORY' | 'DUBBING_STUDIO' | 'FLASH_MATCH' | 'MEDIA_PLAYER';

export interface GameConfig {
  engine: GameEngineType;
  title: string;
  instructions: string;
  config_data: any; // Flexible payload for specific engines
}

// --- AGENT 5: ORCHESTRATOR (The Director) ---
export interface ActivityBlock {
  type: string; // Mapped from GameEngineType or standard blocks
  title: string;
  duration: number; // minutes
  data?: any;
  config?: any; // App uses config often
}

// Output from the Agent 5 (Pipeline)
export interface PipelineOrchestratorOutput {
  meta: {
    title: string;
    theme: string;
  };
  timeline: ActivityBlock[];
}

// The App's Expected Manifest Structure (Transformed)
export interface LessonManifest {
  meta: {
    unit_title: string;
    theme: string;
    difficulty_cefr?: string;
  };
  theme_context?: ThemeContext;
  knowledge_graph: {
    characters: any[];
    vocabulary: VocabAsset[];
    grammar_rules: GrammarRuleAsset[];
    narrative_arc?: string;
  };
  timeline: ActivityBlock[];
  enriched_content?: {
    title?: string;
    topic?: string;
    gradeLevel?: string;
    description?: string;
    vocabulary: any[];
    grammar: any[];
    characters: any[];
    story: { title: string; setting: string; pages: any[] };
    song_suggestions: any[];
    video_suggestions: any[];
    dialogues: any[];
  };
}
