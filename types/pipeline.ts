
// --- AGENT 1: VISION SCANNER (The Eyes) ---
export type VisualZoneType = 'VISUAL_PUZZLE' | 'COMIC_STRIP' | 'GRAMMAR_TABLE' | 'SONG_SHEET' | 'VOCAB_LIST' | 'READING_PASSAGE' | 'ILLUSTRATION';

export interface VisualZone {
  id: string;
  type: VisualZoneType;
  description: string;
  text_content?: string;
  coordinates_hint?: string; // e.g. "Top-left", "Bottom-center"
}

export interface RawPageInventory {
  detected_zones: VisualZone[];
  overall_layout: string; // e.g., "Two-column mixed media"
  dominating_visual: string; // e.g., "A large jungle maze"
}

// --- AGENT 2: PEDAGOGUE (The Brain) ---
export interface LearningObjective {
  primary_topic: string; // e.g. "Jungle Animals"
  grammar_focus?: string; // e.g. "Present Continuous (is running)"
  target_skills: ('LISTENING' | 'SPEAKING' | 'READING' | 'WRITING' | 'LOGIC')[];
  difficulty_cefr: 'Pre-A1' | 'A1' | 'A2' | 'B1';
  educational_goal: string; // e.g. "Student can describe animal actions."
}

// --- AGENT 3: ASSET CURATOR (The Producer) ---
export interface VocabAsset {
  word: string;
  definition: string;
  distractors: string[]; // "Lion" -> ["Tiger", "Bear", "Wolf"]
  image_prompt: string; // "Cartoon lion roaring, vector style"
}

// Alias for consumers expecting RichVocabItem
export type RichVocabItem = VocabAsset;

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
  knowledge_graph: {
    characters: any[];
    vocabulary: VocabAsset[];
    grammar_rules: any[];
    narrative_arc?: string;
  };
  timeline: ActivityBlock[];
}

// --- THE MASTER PIPELINE OBJECT ---
export interface AgentPipelineOutput {
  agent_1_vision: RawPageInventory;
  agent_2_pedagogy: LearningObjective;
  agent_3_assets: AssetManifest;
  agent_4_mechanics: GameConfig[];
  agent_5_orchestrator: PipelineOrchestratorOutput;
}
