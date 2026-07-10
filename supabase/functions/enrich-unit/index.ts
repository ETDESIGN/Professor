import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generateAndStoreAudio, mapWithConcurrency } from '../_shared/tts.ts';

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'enrich-unit',
    requireAuth: true,
    rateLimit: { maxRequests: 20, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'unitId', required: true, type: 'string' },
      { field: 'category', required: false, type: 'string' },
    ],
  }, async (body, auth) => {
    const { unitId, category = 'all' } = body;
    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
    const aiApiKey = Deno.env.get('AI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!auth?.userId) {
      return { success: false, error: 'Authentication required' };
    }

    if (!aiApiKey) {
      return { success: false, error: 'AI_API_KEY not configured' };
    }

    const sbClient = createClient(supabaseUrl, supabaseKey);
    const { data: unit, error: unitError } = await sbClient
      .from('units')
      .select('*')
      .eq('id', unitId)
      .single();

    if (unitError || !unit) {
      return { success: false, error: 'Unit not found' };
    }

    if (unit.teacher_id && unit.teacher_id !== auth.userId) {
      return { success: false, error: 'You do not own this unit' };
    }

    const scannedAssets = unit.scanned_assets || [];

    const allVocab: any[] = [];
    let topic = unit.topic || '';
    let gradeLevel = 'Beginner';
    let extractedText = '';

    for (const asset of scannedAssets) {
      const meta = asset?.metadata || asset || {};
      if (meta.topic) topic = meta.topic;
      if (meta.gradeLevel) gradeLevel = meta.gradeLevel;
      if (meta.extractedText) extractedText += meta.extractedText + '\n';
      if (Array.isArray(meta.vocabulary)) {
        allVocab.push(...meta.vocabulary);
      }
    }

    if (allVocab.length === 0 && !extractedText) {
      return { success: false, error: 'No content found to enrich. Upload and extract pages first.' };
    }

    // ── REGION-SAFE MODELS ──────────────────────────────────────────────
    // User's OpenRouter region blocks Google, OpenAI, and Anthropic.
    // Only use models from: Moonshot, Qwen, DeepSeek, Meta, NVIDIA, etc.
    const models = [
      Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-k2.6',
      Deno.env.get('FALLBACK_MODEL_NAME') || 'qwen/qwen3-235b-a22b',
      'deepseek/deepseek-r1-0528:free',
    ];

    // ── AI CALL (no response_format — prompt-only JSON enforcement) ────
    async function callAI(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<any> {
      let lastError = '';
      for (const modelName of models) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000);

          const resp = await fetch(`${aiBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature,
              max_tokens: 5000,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            console.error(`enrich-unit [${category}] HTTP ${resp.status} for ${modelName}:`, errBody.substring(0, 300));
            continue;
          }

          const data = await resp.json();
          if (data.error) {
            console.error(`enrich-unit [${category}] API error for ${modelName}:`, JSON.stringify(data.error).substring(0, 300));
            continue;
          }

          let content = data.choices?.[0]?.message?.content || '{}';
          // Strip markdown, thinking tags, and code fences
          content = content.replace(/```json/g, '').replace(/```/g, '').trim();
          content = content.replace(/<(think|reasoning)>[\s\S]*?(<\/(think|reasoning)>|$)/gi, '').trim();
          content = content.replace(/\|begin_thinking\|[\s\S]*?(\|end_thinking\||$)/gi, '').trim();

          // Log telemetry
          if (supabaseUrl && supabaseKey && data.usage) {
            const sb = createClient(supabaseUrl, supabaseKey);
            await sb.from('llm_telemetry').insert({
              function_name: 'enrich-unit',
              model_used: data.model || modelName,
              prompt_tokens: data.usage.prompt_tokens || 0,
              completion_tokens: data.usage.completion_tokens || 0,
              total_tokens: data.usage.total_tokens || 0,
            });
          }

          // Extract JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.error(`enrich-unit [${category}] ${modelName}: No JSON found in response. Content preview:`, content.substring(0, 200));
            continue;
          }

          const parsed = JSON.parse(jsonMatch[0]);

          // ── KEY NORMALIZATION ──────────────────────────────────────
          // Different models return keys in different formats. Normalize them.
          const normalized: any = {};
          for (const [key, value] of Object.entries(parsed)) {
            const lk = key.toLowerCase().replace(/[_\s-]/g, '');
            if (lk === 'vocabulary' || lk === 'vocab' || lk === 'words' || lk === 'vocabularywords') {
              normalized.vocabulary = value;
            } else if (lk === 'grammar' || lk === 'grammarrules' || lk === 'rules') {
              normalized.grammar = value;
            } else if (lk === 'characters' || lk === 'chars') {
              normalized.characters = value;
            } else if (lk === 'story' || lk === 'storydata') {
              normalized.story = value;
            } else if (lk === 'songsuggestions' || lk === 'songs') {
              normalized.song_suggestions = value;
            } else if (lk === 'videosuggestions' || lk === 'videos') {
              normalized.video_suggestions = value;
            } else if (lk === 'dialogues' || lk === 'dialogs' || lk === 'dialogue') {
              normalized.dialogues = value;
            } else {
              normalized[key] = value;
            }
          }

          console.log(`enrich-unit SUCCESS [${category}] model=${data.model || modelName}:`, JSON.stringify({
            rawKeys: Object.keys(parsed),
            normalizedKeys: Object.keys(normalized),
            vocabCount: Array.isArray(normalized.vocabulary) ? normalized.vocabulary.length : typeof normalized.vocabulary,
            grammarCount: Array.isArray(normalized.grammar) ? normalized.grammar.length : typeof normalized.grammar,
            charCount: Array.isArray(normalized.characters) ? normalized.characters.length : typeof normalized.characters,
            storyPages: normalized.story?.pages?.length,
            songs: Array.isArray(normalized.song_suggestions) ? normalized.song_suggestions.length : typeof normalized.song_suggestions,
            videos: Array.isArray(normalized.video_suggestions) ? normalized.video_suggestions.length : typeof normalized.video_suggestions,
            dialogues: Array.isArray(normalized.dialogues) ? normalized.dialogues.length : typeof normalized.dialogues,
          }));

          if (Object.keys(normalized).length > 0) {
            return normalized;
          } else {
            throw new Error('AI returned an empty object or invalid keys.');
          }
        } catch (err: any) {
          console.error(`enrich-unit CATCH [${category}] model=${modelName}:`, err.message || String(err));
          lastError = err.message || String(err);
        }
      }
      return { _error: lastError || 'All models failed to produce valid JSON due to token truncation or invalid format.' };
    }

    // ── CATEGORY PROMPTS ────────────────────────────────────────────────
    let expectedOutputFormat = '';
    let categoryRules = '';

    switch (category) {
      case 'vocabulary':
        expectedOutputFormat = `{ "title": "Unit title", "topic": "Main topic", "gradeLevel": "A1/A2/B1", "description": "2-3 sentence unit description", "vocabulary": [ { "word": "word", "phonetic": "/IPA pronunciation/", "part_of_speech": "noun", "definition": "simple child-friendly English definition", "l1_translation": "简体中文翻译 (Simplified Chinese)", "example_sentence": "a short sentence using the word", "translation": "简体中文翻译 (same as l1_translation)", "image_prompt": "a cute cartoon illustration of [word] for children, simple flat style, bright colors", "distractors": ["plausible wrong meaning 1", "plausible wrong meaning 2", "plausible wrong meaning 3"], "confusables": ["a word easily confused with this one"] } ] }`;
        categoryRules = "- Extract exactly 6-10 key vocabulary words from the text\n- For each word include: phonetic (IPA transcription), part_of_speech, a child-friendly English definition, an example_sentence using the word\n- l1_translation and translation MUST be Simplified Chinese (简体中文) — the learners' native language is Chinese\n- Include 2-3 plausible distractors (wrong meaning options) per word\n- Include 1-2 confusables per word (words easily confused in spelling/sound/meaning)\n- For image_prompt: describe a cute, simple, child-friendly cartoon illustration of each word";
        break;
      case 'grammar':
        expectedOutputFormat = `{ "grammar": [ { "rule": "rule name", "explanation": "simple explanation", "examples": ["example 1", "example 2", "example 3"], "pattern_template": "Subject + ___ + Object", "transformation_pairs": [ {"original": "I play.", "transformed": "I am playing."} ], "error_examples": [ {"wrong": "He play.", "correct": "He plays."} ] } ] }`;
        categoryRules = "- Extract exactly 1-2 core grammar rules from the text\n- Include simple explanations suitable for children and 3 examples each\n- pattern_template: a fill-in-the-blank structure showing how the rule forms a sentence\n- transformation_pairs: 2-4 pairs showing a transformation (e.g. affirmative->negative, singular->plural, statement->question)\n- error_examples: 2-3 common learner errors with the corrected form";
        break;
      case 'characters':
        expectedOutputFormat = `{ "characters": [ { "name": "name", "role": "teacher/student/friend", "personality": "brave/smart/funny", "image_prompt": "a friendly cartoon [role] named [name] who is [personality], children's book illustration style, bright colors, simple design" } ] }`;
        categoryRules = "- Create exactly 2-4 fun characters suitable for children aged 6-12\n- Give them distinct roles, personalities, and visual descriptions in image_prompt\n- Characters should relate to the topic of the lesson.";
        break;
      case 'story':
        expectedOutputFormat = `{ "story": { "title": "story title", "setting": "where it happens", "pages": [ { "text": "story text (2-3 sentences)", "speaker": "character name", "image_prompt": "scene description for illustration", "comprehension_questions": [ {"question": "yes/no or simple WH question", "options": ["a","b","c"], "answer": 0} ] } ] } }`;
        categoryRules = "- Write exactly 3-5 story pages using the target vocabulary words\n- Make the story engaging and age-appropriate for children 6-12\n- Each page should have a speaker and scene description\n- Each page MUST include 1-2 comprehension_questions with 3 options and the 0-based answer index, so the story has a real reading-comprehension quiz";
        break;
      case 'media':
        expectedOutputFormat = `{ "song_suggestions": [ { "title": "real song title", "topic_relevance": "why it fits this lesson", "search_query": "YouTube search query to find this song" } ], "video_suggestions": [ { "title": "real video title", "topic_relevance": "why it fits this lesson", "search_query": "YouTube search query to find this video" } ] }`;
        categoryRules = "- Suggest exactly 2-3 REAL existing children's songs on YouTube with search queries\n- Suggest exactly 2-3 REAL existing educational videos on YouTube with search queries\n- Songs and videos must be age-appropriate and related to the lesson topic.";
        break;
      case 'dialogues':
        expectedOutputFormat = `{ "dialogues": [ { "title": "dialogue title", "lines": [ {"speaker": "character name", "text": "what they say"} ] } ] }`;
        categoryRules = "- Write exactly 1-2 realistic dialogues using the target vocabulary\n- Each dialogue should have 4-6 lines between 2 speakers.";
        break;
      default:
        expectedOutputFormat = `{ "title": "...", "topic": "...", "gradeLevel": "...", "description": "...", "vocabulary": [], "grammar": [], "characters": [], "story": {"title":"", "setting":"", "pages":[]}, "song_suggestions": [], "video_suggestions": [], "dialogues": [] }`;
        categoryRules = "- 6-10 vocabulary words\n- 1-2 grammar rules\n- 2-4 characters\n- 3-5 story pages\n- 2-3 songs and videos\n- 1-2 dialogues";
        break;
    }

    const enrichSystemPrompt = `You are Professor AI, an expert ESL/EFL curriculum designer for children aged 6-12.
Given raw extracted text and vocabulary from a textbook page, generate ONLY the requested category of content.

CRITICAL: You MUST return ONLY a valid JSON object. No markdown, no explanations, no text before or after the JSON.
The JSON must match the exact format specified by the user.`;

    const enrichUserPrompt = `Topic: ${topic}
Grade Level: ${gradeLevel}
Extracted Text: ${extractedText.slice(0, 8000)}
Raw Vocabulary Found: ${JSON.stringify(allVocab.slice(0, 20))}

Generate the "${category}" content for this ESL lesson unit.

You MUST return ONLY this JSON format (no other text):
${expectedOutputFormat}

Rules:
${categoryRules}
- All content must be age-appropriate and culturally sensitive.
- Return ONLY the JSON object, nothing else.`;

    const enriched = await callAI(enrichSystemPrompt, enrichUserPrompt, 0.7);

    if (enriched._error) {
      return { success: false, error: enriched._error };
    }

    // ── PREPARE PLACEHOLDER IMAGES ──────────────────────────────────────
    if (enriched.vocabulary && Array.isArray(enriched.vocabulary)) {
      enriched.vocabulary = enriched.vocabulary.map((v: any) => ({
        ...v,
        image_url: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word || 'item')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`,
        image_status: 'pending' as const,
      }));
    }

    // ── TTS AUDIO per vocab word + example_sentence (Phase 1.2) ────────────
    // Best-effort, bounded concurrency. Stores audio_url (word) + example_audio_url
    // (the example_sentence) so LISTEN_SELECT/FOCUS_CARDS (word) AND
    // DICTATION/SPEAK_SENTENCE (sentence) have real audio. On failure the field is
    // left empty and the client SpeechService falls back to window.speechSynthesis.
    if ((category === 'vocabulary' || category === 'all') && Array.isArray(enriched.vocabulary) && enriched.vocabulary.length > 0) {
      // Word audio.
      const wordInputs = enriched.vocabulary.map((v: any) => String(v.word || '')).filter(Boolean);
      const wordResults = await mapWithConcurrency(wordInputs, 3, (w) =>
        generateAndStoreAudio(w, unitId).then((r) => ({ word: w, url: r.url })),
      );
      const audioMap = new Map(wordResults.filter((r) => r.url).map((r) => [r.word, r.url]));
      // Example-sentence audio (bounded: up to 2x words to limit cost/latency).
      const sentInputs = enriched.vocabulary
        .map((v: any) => ({ word: String(v.word || ''), sentence: String(v.example_sentence || v.context_sentence || '') }))
        .filter((v) => v.word && v.sentence);
      const sentResults = await mapWithConcurrency(sentInputs.slice(0, wordInputs.length * 2), 3, (vi) =>
        generateAndStoreAudio(vi.sentence, unitId).then((r) => ({ word: vi.word, url: r.url })),
      );
      const sentMap = new Map(sentResults.filter((r) => r.url).map((r) => [r.word, r.url]));

      enriched.vocabulary = enriched.vocabulary.map((v: any) => {
        const w = String(v.word || '');
        const patch: any = {};
        if (audioMap.has(w)) patch.audio_url = audioMap.get(w);
        if (sentMap.has(w)) patch.example_audio_url = sentMap.get(w);
        return Object.keys(patch).length ? { ...v, ...patch } : v;
      });
      console.log(`enrich-unit AUDIO [${category}]: ${audioMap.size}/${wordInputs.length} word audio, ${sentMap.size}/${sentInputs.length} sentence audio`);
    }
    if (enriched.characters && Array.isArray(enriched.characters)) {
      enriched.characters = enriched.characters.map((ch: any) => ({
        ...ch,
        image_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ch.name || 'char')}`,
        image_status: 'pending' as const,
      }));
    }

    // ── ATOMIC MERGE ────────────────────────────────────────────────────
    // Read FRESH manifest right before writing to avoid race conditions
    const { data: freshUnit } = await sbClient.from('units').select('manifest').eq('id', unitId).single();
    const currentManifest = freshUnit?.manifest?.enriched_content || {
      title: '', topic: '', gradeLevel: 'A1', description: '',
      vocabulary: [], grammar: [], characters: [], story: { title: '', setting: '', pages: [] },
      song_suggestions: [], video_suggestions: [], dialogues: []
    };

    // Log what we're merging
    console.log(`enrich-unit MERGE [${category}]:`, JSON.stringify({
      currentKeys: Object.entries(currentManifest).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : typeof v}`),
      enrichedKeys: Object.entries(enriched).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : typeof v}`),
    }));

    // Start from current manifest (preserves all existing data)
    const mergedManifest = { ...currentManifest };

    // Update metadata if the AI returned it
    if (enriched.title && enriched.title !== 'Unit title') mergedManifest.title = enriched.title;
    if (enriched.topic && enriched.topic !== 'Main topic') mergedManifest.topic = enriched.topic;
    if (enriched.gradeLevel) mergedManifest.gradeLevel = enriched.gradeLevel;
    if (enriched.description) mergedManifest.description = enriched.description;

    // Category-specific merge: ONLY update the keys for this category
    const categoryKeyMap: Record<string, string[]> = {
      vocabulary: ['vocabulary'],
      grammar: ['grammar'],
      characters: ['characters'],
      story: ['story'],
      media: ['song_suggestions', 'video_suggestions'],
      dialogues: ['dialogues'],
      all: ['vocabulary', 'grammar', 'characters', 'story', 'song_suggestions', 'video_suggestions', 'dialogues'],
    };

    const keysToUpdate = categoryKeyMap[category] || [category];
    for (const key of keysToUpdate) {
      if (key === 'story') {
        if (enriched.story && (enriched.story.pages?.length > 0 || enriched.story.title)) {
          mergedManifest.story = { ...currentManifest.story, ...enriched.story };
        }
      } else if (enriched[key] !== undefined) {
        // Accept any non-empty array
        if (Array.isArray(enriched[key]) && enriched[key].length > 0) {
          mergedManifest[key] = enriched[key];
        }
      }
    }

    // Log what we're writing
    console.log(`enrich-unit WRITE [${category}]:`, JSON.stringify({
      mergedKeys: Object.entries(mergedManifest).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : typeof v}`),
    }));

    // Write to DB
    const { error: updateError } = await sbClient
      .from('units')
      .update({
        manifest: {
          meta: {
            unit_title: mergedManifest.title || unit.title,
            theme: mergedManifest.topic || topic,
            difficulty_cefr: mergedManifest.gradeLevel
          },
          enriched_content: mergedManifest
        },
        topic: mergedManifest.topic || unit.topic || topic,
        title: mergedManifest.title || unit.title,
      })
      .eq('id', unitId);

    if (updateError) {
      console.error(`enrich-unit DB UPDATE ERROR [${category}]:`, updateError.message);
    }

    // Verify write by reading back
    const { data: verifyUnit } = await sbClient.from('units').select('manifest').eq('id', unitId).single();
    const verifyContent = verifyUnit?.manifest?.enriched_content || {};
    console.log(`enrich-unit VERIFY [${category}]:`, JSON.stringify({
      vocab: Array.isArray(verifyContent.vocabulary) ? verifyContent.vocabulary.length : 0,
      grammar: Array.isArray(verifyContent.grammar) ? verifyContent.grammar.length : 0,
      chars: Array.isArray(verifyContent.characters) ? verifyContent.characters.length : 0,
      storyPages: verifyContent.story?.pages?.length || 0,
      songs: Array.isArray(verifyContent.song_suggestions) ? verifyContent.song_suggestions.length : 0,
      videos: Array.isArray(verifyContent.video_suggestions) ? verifyContent.video_suggestions.length : 0,
      dialogues: Array.isArray(verifyContent.dialogues) ? verifyContent.dialogues.length : 0,
    }));

    return {
      success: true,
      unitId,
      category,
      enriched: mergedManifest,
    };
  });
});
