
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AgentPipelineOutput, LessonManifest } from "../types/pipeline";
import { GEMINI_PRO_MODEL, GEMINI_FLASH_MODEL } from "../constants";

// Re-export types for consumers
export * from "../types/pipeline";

export interface PronunciationResult {
  score: number;
  feedback: string;
  wordScores: { text: string; score: 'high' | 'medium' | 'low' | 'none' }[];
}

// --- HELPER: ROBUST JSON PARSING ---
const cleanJsonOutput = (text: string): string => {
  if (!text) return "{}";
  let cleaned = text.trim();
  
  // Remove markdown code blocks explicitly
  cleaned = cleaned.replace(/```json/g, "").replace(/```/g, "");
  
  // Find the first { or [ and the last } or ]
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  
  let start = -1;
  let end = -1;
  
  if (firstBrace !== -1 && firstBracket !== -1) {
    start = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    start = firstBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
  }
  
  if (lastBrace !== -1 && lastBracket !== -1) {
    end = Math.max(lastBrace, lastBracket);
  } else if (lastBrace !== -1) {
    end = lastBrace;
  } else if (lastBracket !== -1) {
    end = lastBracket;
  }
  
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }
  
  return cleaned.trim();
};

// --- HELPER: RETRY LOGIC ---
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  retries: number = 1, // Reduced default retries to fail faster
  delay: number = 1000
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    // Immediate fallback for network errors (XHR, Connection Closed)
    const isNetworkError = error.message?.includes('xhr') || error.message?.includes('fetch') || error.code === 6 || error.code === 500;
    
    if (isNetworkError) {
        console.warn("⚠️ Network error detected. Skipping retries to force fallback.");
        throw error; // Throw immediately to catch block which switches models
    }

    if (retries === 0) throw error;
    
    console.warn(`API Request failed. Retrying in ${delay}ms... (Attempts left: ${retries})`, error.message);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
};

// Initialize the client
const getClient = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined");
  }
  return new GoogleGenAI({ apiKey });
};

// --- VALIDATION HELPER ---
export const validateApiKey = async (): Promise<{ valid: boolean; message?: string }> => {
  try {
    const ai = getClient();
    // Minimal request to check auth
    await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: { parts: [{ text: 'ping' }] },
    });
    return { valid: true };
  } catch (error: any) {
    console.error("API Validation Failed:", error);
    return { valid: false, message: error.message || "Unknown API Error" };
  }
};

// --- AGENT PROMPTS & SCHEMAS ---

const VISION_PROMPT = `### 🕵️ AGENT 1: THE VISION SCANNER
Analyze the input (image layout or text topic). Map the structure and identify key educational elements.
- Detect content types: 'VISUAL_PUZZLE', 'COMIC_STRIP', 'GRAMMAR_TABLE', 'SONG_SHEET', 'VOCABULARY_LIST', 'READING_PASSAGE', 'ILLUSTRATION'.
- Extract raw text, identify characters, and note visual context.
Output JSON only.`;

const visionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    detected_zones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING, enum: ['VISUAL_PUZZLE', 'COMIC_STRIP', 'GRAMMAR_TABLE', 'SONG_SHEET', 'VOCABULARY_LIST', 'READING_PASSAGE', 'ILLUSTRATION'] },
          description: { type: Type.STRING },
          text_content: { type: Type.STRING }
        },
        required: ["id", "type", "description"]
      }
    },
    overall_layout: { type: Type.STRING },
    dominating_visual: { type: Type.STRING }
  },
  required: ["detected_zones"]
};

const PEDAGOGY_PROMPT = `### 🧠 AGENT 2: THE PEDAGOGUE
Interpret the Vision Scanner's inventory to establish the educational framework.
- Determine the Primary Learning Goal.
- Determine the target CEFR Level (Pre-A1 to B1).
- Identify key vocabulary words and core grammar structures to focus on.
Output JSON only.`;

const pedagogySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    primary_topic: { type: Type.STRING },
    grammar_focus: { type: Type.STRING },
    target_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    difficulty_cefr: { type: Type.STRING, enum: ['Pre-A1', 'A1', 'A2', 'B1'] },
    educational_goal: { type: Type.STRING }
  },
  required: ["primary_topic", "educational_goal"]
};

const ASSETS_PROMPT = `### 🎨 AGENT 3: THE ASSET CURATOR
Identify what is missing to make this interactive and generate supplementary assets based on the Pedagogy.
- For Vocabulary: Generate clear definitions, example sentences, and 3 plausible "Distractors" (wrong answers) for quizzes.
- For Comics/Dialogues: Extract dialogue lines, assign characters, and infer emotions/tones.
- Design highly descriptive, vivid background image prompts for visual generation.
Output JSON only.`;

const assetsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    vocabulary_enhancements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          definition: { type: Type.STRING },
          distractors: { type: Type.ARRAY, items: { type: Type.STRING } },
          image_prompt: { type: Type.STRING }
        }
      }
    },
    audio_production_queue: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          character_id: { type: Type.STRING },
          text: { type: Type.STRING },
          emotion: { type: Type.STRING }
        }
      }
    },
    background_image_prompt: { type: Type.STRING }
  },
  required: ["vocabulary_enhancements"]
};

const MECHANICS_PROMPT = `### 🏗️ AGENT 4: THE GAME MECHANIC
Map the curated content to specific interactive Game Engines:
1. **LOGIC_LABYRINTH**: For visual puzzles and problem-solving.
2. **SENTENCE_FACTORY**: For grammar tables and sentence construction.
3. **DUBBING_STUDIO**: For comics and role-play dialogues.
4. **FLASH_MATCH**: For vocabulary acquisition and matching games.
5. **MEDIA_PLAYER**: For songs and listening comprehension.
- Define the specific mechanics, win conditions, and feedback for each game block.
Output JSON only as an array of objects.`;

const mechanicsSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      engine: { type: Type.STRING, enum: ['LOGIC_LABYRINTH', 'SENTENCE_FACTORY', 'DUBBING_STUDIO', 'FLASH_MATCH', 'MEDIA_PLAYER'] },
      title: { type: Type.STRING },
      instructions: { type: Type.STRING },
      config_data: { type: Type.OBJECT, properties: { 
         items: { type: Type.ARRAY, items: { type: Type.STRING } }, 
         sentences: { type: Type.ARRAY, items: { type: Type.STRING } }
      }}
    },
    required: ["engine", "title"]
  }
};

const ORCHESTRATOR_PROMPT = `### 🎬 AGENT 5: THE ORCHESTRATOR
Assemble the final "LessonManifest" timeline using the Game Mechanics constraints.
- Sequence the game blocks logically (e.g., Warm-up -> Presentation -> Practice -> Production -> Review).
- Ensure smooth transitions and a cohesive narrative or theme throughout the lesson.
Output JSON only.`;

const orchestratorSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    meta: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        theme: { type: Type.STRING }
      }
    },
    timeline: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          title: { type: Type.STRING },
          duration: { type: Type.INTEGER },
          data: { type: Type.OBJECT, properties: {
             config: { 
               type: Type.OBJECT,
               properties: {
                 search_query: { type: Type.STRING },
                 items: { type: Type.ARRAY, items: { type: Type.STRING } },
                 text: { type: Type.STRING },
                 cards: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { front: {type: Type.STRING}, back: {type: Type.STRING} } } }
               }
             }
          }}
        },
        required: ["type", "title"]
      }
    }
  },
  required: ["meta", "timeline"]
};

// --- MAIN FUNCTION: SEQUENTIAL CHAIN ---

const runAgent = async (ai: GoogleGenAI, model: string, instruction: string, schema: Schema, contentParts: any[]): Promise<any> => {
   return retryWithBackoff(async () => {
      const response = await ai.models.generateContent({
         model,
         contents: { parts: contentParts },
         config: {
            systemInstruction: instruction,
            responseMimeType: "application/json",
            responseSchema: schema
         }
      });
      const text = cleanJsonOutput(response.text || "{}");
      return JSON.parse(text);
   }, 2, 1000);
};

export const runPipeline = async (initialContents: any[]): Promise<AgentPipelineOutput> => {
   const ai = getClient();
   const model = GEMINI_PRO_MODEL; // use pro for complex reasoning
   const fastModel = GEMINI_FLASH_MODEL; // use flash for simpler mapping

   console.log("🕵️ Run Agent 1: Vision Scanner");
   let agent_1_vision;
   try {
       agent_1_vision = await runAgent(ai, model, VISION_PROMPT, visionSchema, [...initialContents, { text: "Execute Vision Scanner."}]);
   } catch (e) {
       console.warn("Pro Vision failed, falling back to Flash", e);
       agent_1_vision = await runAgent(ai, fastModel, VISION_PROMPT, visionSchema, [...initialContents, { text: "Execute Vision Scanner."}]);
   }

   console.log("🧠 Run Agent 2: Pedagogue");
   const agent_2_pedagogy = await runAgent(ai, fastModel, PEDAGOGY_PROMPT, pedagogySchema, [
      { text: `Vision Scanner Output:\n${JSON.stringify(agent_1_vision, null, 2)}\n\nExecute Pedagogue.` }
   ]);

   console.log("🎨 Run Agent 3: Asset Curator");
   const agent_3_assets = await runAgent(ai, fastModel, ASSETS_PROMPT, assetsSchema, [
      { text: `Vision Scanner Output:\n${JSON.stringify(agent_1_vision)}\n\nPedagogy Output:\n${JSON.stringify(agent_2_pedagogy)}\n\nExecute Asset Curator.` }
   ]);

   console.log("🏗️ Run Agent 4: Game Mechanic");
   const agent_4_mechanics = await runAgent(ai, fastModel, MECHANICS_PROMPT, mechanicsSchema, [
      { text: `Assets Output:\n${JSON.stringify(agent_3_assets)}\n\nExecute Game Mechanic.` }
   ]);

   console.log("🎬 Run Agent 5: Orchestrator");
   const agent_5_orchestrator = await runAgent(ai, fastModel, ORCHESTRATOR_PROMPT, orchestratorSchema, [
      { text: `Pedagogy Output:\n${JSON.stringify(agent_2_pedagogy)}\n\nGame Mechanics Output:\n${JSON.stringify(agent_4_mechanics)}\n\nExecute Orchestrator.` }
   ]);

   return {
      agent_1_vision,
      agent_2_pedagogy,
      agent_3_assets,
      agent_4_mechanics,
      agent_5_orchestrator
   };
};

export const generateLessonManifest = async (topic: string): Promise<LessonManifest | null> => {
  try {
    console.log(`🚀 Generating Lesson Manifest for topic: ${topic}`);
    const pipelineOutput = await runPipeline([{ text: `Topic: "${topic}"` }]);
    console.log("✅ Lesson Generation Success!");
    return mapPipelineToManifest(pipelineOutput);
  } catch (error) {
    console.error("🚨 Lesson Generation Failure:", error);
    return null;
  }
};

export const analyzeTextbookPage = async (imageBase64: string): Promise<LessonManifest | null> => {
  try {
    console.log("🚀 Starting Sequential 5-Agent Pipeline Analysis...");
    const pipelineOutput = await runPipeline([{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }]);
    console.log("✅ Pipeline Success!");
    return mapPipelineToManifest(pipelineOutput);
  } catch (error) {
    console.error("🚨 Pipeline Failure:", error);
    return createFallbackManifest();
  }
};

export const analyzeSyllabus = async (imageB64Array: string[]): Promise<LessonManifest[]> => {
  try {
    if (imageB64Array.length === 0) return [createFallbackManifest()];
    
    console.log(`🚀 Starting Syllabus Analysis with ${imageB64Array.length} pages...`);
    const imageParts = imageB64Array.map(b64 => ({
      inlineData: { mimeType: 'image/jpeg', data: b64 }
    }));
    
    // For a syllabus we can just run the pipeline once with all images for prototype purposes
    const pipelineOutput = await runPipeline(imageParts);
    console.log(`✅ Syllabus Pipeline Success!`);
    return [mapPipelineToManifest(pipelineOutput)];
  } catch (error) {
    console.error("🚨 Syllabus Pipeline Failure:", error);
    return [createFallbackManifest()];
  }
};

const mapPipelineToManifest = (pipelineOutput: AgentPipelineOutput): LessonManifest => {
    return {
      meta: {
        unit_title: pipelineOutput.agent_5_orchestrator?.meta?.title || "New Lesson",
        theme: pipelineOutput.agent_5_orchestrator?.meta?.theme || "General",
        difficulty_cefr: pipelineOutput.agent_2_pedagogy?.difficulty_cefr || "A1"
      },
      knowledge_graph: {
        characters: [], 
        vocabulary: (pipelineOutput.agent_3_assets?.vocabulary_enhancements || []).map(v => ({
          word: v.word,
          definition: v.definition,
          distractors: v.distractors || [],
          image_prompt: v.image_prompt
        })),
        grammar_rules: [{ 
           rule: pipelineOutput.agent_2_pedagogy?.grammar_focus || "General Usage", 
           examples: [] 
        }],
        narrative_arc: `Lesson about ${pipelineOutput.agent_2_pedagogy?.primary_topic || 'topic'}`
      },
      timeline: (pipelineOutput.agent_5_orchestrator?.timeline || []).map(block => ({
        ...block,
        config: block.data?.config || block.data || {} 
      }))
    };
};

export const differentiateText = async (text: string, theme: string): Promise<{ below: string, on: string, above: string }> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: GEMINI_FLASH_MODEL,
      contents: `Take the following text about "${theme}" and rewrite it into 3 distinct reading levels:
      1. Below Level (Simple vocabulary, short sentences)
      2. On Level (Standard vocabulary, compound sentences)
      3. Above Level (Advanced vocabulary, complex sentence structures)
      
      Text: "${text}"
      
      Output valid JSON with keys: "below", "on", "above".`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            below: { type: Type.STRING },
            on: { type: Type.STRING },
            above: { type: Type.STRING }
          },
          required: ["below", "on", "above"]
        }
      }
    });

    const rawText = response.text || "";
    if (!rawText) throw new Error("Empty response from Gemini");

    return JSON.parse(cleanJsonOutput(rawText));
  } catch (error) {
    console.error("🚨 Differentiation Failure:", error);
    return {
      below: text,
      on: text,
      above: text
    };
  }
};

// --- LEGACY HELPERS ---

const createFallbackManifest = (): LessonManifest => ({
  meta: {
    unit_title: "Scan Failed (Fallback)",
    theme: "Error Recovery",
    difficulty_cefr: "A1"
  },
  knowledge_graph: { characters: [], vocabulary: [], grammar_rules: [] },
  timeline: [
    {
      type: 'MEDIA_PLAYER',
      title: 'Error Recovery Mode',
      duration: 5,
      config: { search_query: 'Relaxing Music' }
    }
  ]
});

export const generateSong = async (topic: string): Promise<{ title: string; lyrics: string } | null> => {
  return { title: "Song Gen Disabled", lyrics: "Feature pending..." };
};

export const generateImage = async (prompt: string): Promise<string | null> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/jpeg;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image generation failed:", error);
    return null;
  }
};

export interface DubbingResult {
  score: number;
  feedback: string;
  emotionMatch: 'high' | 'medium' | 'low';
  timing: 'perfect' | 'early' | 'late';
}

export const evaluateDubbing = async (audioBase64: string, targetText: string, targetEmotion: string): Promise<DubbingResult | null> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: audioBase64,
              mimeType: 'audio/webm'
            }
          },
          {
            text: `Analyze the voice acting/dubbing of the following text in the provided audio: "${targetText}". The target emotion is "${targetEmotion}".
            Return a JSON object with:
            - score: overall score from 0 to 100
            - feedback: a short string of encouraging feedback for the student
            - emotionMatch: how well the emotion matches ('high', 'medium', 'low')
            - timing: how well the timing matches ('perfect', 'early', 'late').`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text) as DubbingResult;
    }
    return null;
  } catch (error) {
    console.error("Dubbing evaluation failed:", error);
    return null;
  }
};

export const checkPronunciation = async (audioBase64: string, targetText: string): Promise<PronunciationResult | null> => {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: audioBase64,
              mimeType: 'audio/webm'
            }
          },
          {
            text: `Analyze the pronunciation of the following text in the provided audio: "${targetText}". 
            Return a JSON object with:
            - score: overall score from 0 to 100
            - feedback: a short string of feedback
            - wordScores: an array of objects with 'text' (the word) and 'score' ('high', 'medium', 'low', or 'none').`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text) as PronunciationResult;
    }
    return null;
  } catch (error) {
    console.error("Pronunciation check failed:", error);
    return null;
  }
};
