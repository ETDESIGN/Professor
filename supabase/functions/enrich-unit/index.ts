import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generateAndStoreAudio, mapWithConcurrency } from '../_shared/tts.ts';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';
import { buildPromptWithCharacter, fetchCharacterByName } from '../_shared/characterLook.ts';

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
    const handlerStart = Date.now();
    // Best-effort outcome telemetry (diagnoses the vocab/grammar timeout issue):
    // records category + total duration + ok/err so we can see whether the
    // large-output categories exceed the upstream timeout.
    const logOutcome = async (outcome: string) => {
      try {
        await sbClient.from('llm_telemetry').insert({
          function_name: 'enrich-unit',
          model_used: `outcome:${category}:${outcome}`,
          duration_ms: Date.now() - handlerStart,
        });
      } catch { /* telemetry only */ }
    };
    const { data: unit, error: unitError } = await sbClient
      .from('units')
      .select('*')
      .eq('id', unitId)
      .single();

    if (unitError || !unit) {
      return { success: false, error: 'Unit not found' };
    }

    // Single ownership policy (Bug B1 fix): strict, shared via assertOwnership.
    const ownership = assertUnitOwnership(unit.teacher_id, { callerId: auth.userId });
    if (!ownership.ok) {
      return { success: false, error: ownership.reason };
    }

    // Phase 1.1-6 (locked L1): fetch the book's existing recurring cast so
    // character-driven categories (characters/story/dialogue) REUSE the cast
    // instead of inventing a fresh, disconnected one per unit. Characters are
    // a book-level entity — continuity across units is the whole point.
    const bookId: string | null = unit.book_id || null;
    let existingCast: any[] = [];
    if (bookId) {
      try {
        const { data: castRows } = await sbClient
          .from('characters')
          .select('id, name, role, personality, look_prompt, voice_id')
          .eq('book_id', bookId)
          .order('created_at', { ascending: true });
        existingCast = Array.isArray(castRows) ? castRows : [];
      } catch {
        /* non-fatal: generation proceeds without cast continuity */
      }
    }
    const castRoster = existingCast.length > 0
      ? existingCast.map((c) => `${c.name} (${c.role || 'unknown'}${c.personality ? ', ' + c.personality : ''})`).join('; ')
      : '';

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

    // ── JSON ROBUSTNESS HELPERS ────────────────────────────────────────
    // The vocabulary schema is the largest/most-nested (6-10 words × ~10 fields
    // incl. CJK translations), so it's the category most often truncated at the
    // token ceiling. These two helpers replace the fragile greedy /\{[\s\S]*\}/
    // match + bare JSON.parse that crashed vocabulary enrichment (non-2xx to
    // the client). extractBalancedJson finds the first balanced object;
    // repairTruncatedJson closes dangling braces/strings when the model ran out
    // of tokens mid-object.

    function extractBalancedJson(text: string): string | null {
      const start = text.indexOf('{');
      if (start === -1) return null;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) return text.slice(start, i + 1);
        }
      }
      // Unbalanced (truncated) — return from start to end so repairTruncatedJson
      // can attempt to close it.
      return text.slice(start);
    }

    function repairTruncatedJson(s: string): string {
      // Strategy: walk with a stack to find unclosed { / [ and dangling quotes,
      // then close them in reverse order. Good enough for token-truncation
      // (the most common cause) where the JSON is structurally sound up to the
      // cut point.
      let out = s.trimEnd();
      // Strip a trailing trailing comma (common truncation artifact).
      out = out.replace(/,\s*$/, '');
      const stack: string[] = [];
      let inStr = false;
      let esc = false;
      for (let i = 0; i < out.length; i++) {
        const ch = out[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
        else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
      }
      // If we ended inside a string, close it.
      if (inStr) out += '"';
      // Strip a trailing dangling comma/colon again after string-close.
      out = out.replace(/,\s*$/, '').replace(/:\s*$/, ': null');
      // Close remaining open structures in reverse order.
      while (stack.length) {
        const opener = stack.pop();
        out += opener === '{' ? '}' : ']';
      }
      return out;
    }


    // ── AI CALL (no response_format — prompt-only JSON enforcement) ────
    // Vocab hardening: vocabulary has the largest/most-nested JSON schema
    // (6-10 words × ~10 fields incl. Chinese translations + distractors), so it
    // is the category most likely to truncate at the token ceiling mid-object.
    // Truncation is handled by extractBalancedJson + repairTruncatedJson below
    // (they salvage incomplete JSON). Do NOT raise max_tokens to "give vocab
    // room" — a previous attempt set it to 9000, which exceeded the output cap
    // of the primary models (kimi-k2.6 ≈ 8192), so OpenRouter rejected the
    // request for EVERY model and vocabulary enrichment failed 100% of the time
    // while grammar/story/etc. (still at 5000) succeeded. 5000 is within every
    // model's cap; if a response truncates, the repair pass closes the JSON.
    const MAX_TOKENS = 5000;

    // Per-model request timeout. Raised from 25s -> 45s (2026-07-30): the two
    // largest-output categories (vocabulary, grammar) were timing out on EVERY
    // fallback model at 25s (their responses legitimately need ~30-45s to
    // generate), so all 3 attempts aborted and the cumulative retry time was
    // killed upstream -> "non-2xx" with no telemetry. A 45s window lets a
    // single model finish a large response instead of aborting it mid-stream.
    // Configurable via AI_REQUEST_TIMEOUT_MS.
    const AI_REQUEST_TIMEOUT_MS = parseInt(Deno.env.get('AI_REQUEST_TIMEOUT_MS') || '45000', 10);

    async function callAI(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<any> {
      let lastError = '';
      for (const modelName of models) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

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
              max_tokens: MAX_TOKENS,
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

          // ── ROBUST JSON EXTRACTION (replaces the greedy /\{[\s\S]*\}/) ──
          // The greedy regex over-captures when the model appends prose after
          // the JSON, and under-captures (grabbing a broken object) when the
          // response truncated mid-string. extractBalancedJson finds the first
          // balanced {...} block; repairTruncatedJson closes dangling braces/
          // quotes when the model ran out of tokens.
          const jsonStr = extractBalancedJson(content);
          if (!jsonStr) {
            console.error(`enrich-unit [${category}] ${modelName}: No JSON object found. Content preview:`, content.substring(0, 200));
            continue;
          }
          let parsed: any;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (parseErr) {
            // Likely token-truncation (unclosed object/array). Attempt a repair
            // that closes dangling structures, then retry. If still broken,
            // fall through to the next model.
            const repaired = repairTruncatedJson(jsonStr);
            try {
              parsed = JSON.parse(repaired);
              console.warn(`enrich-unit [${category}] ${modelName}: JSON repaired after truncation (closed dangling braces).`);
            } catch (repairErr) {
              console.error(`enrich-unit [${category}] ${modelName}: JSON parse failed even after repair:`, (parseErr as any)?.message, '| preview:', jsonStr.substring(0, 200));
              lastError = `JSON parse failed (${(parseErr as any)?.message})`;
              continue;
            }
          }

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
        categoryRules = "- Extract exactly 6-8 key vocabulary words from the text (do NOT exceed 8 — a smaller complete list is better than a larger truncated one)\n- For each word include: phonetic (IPA transcription), part_of_speech, a child-friendly English definition, an example_sentence using the word\n- l1_translation and translation MUST be Simplified Chinese (简体中文) — the learners' native language is Chinese\n- Include 2-3 plausible distractors (wrong meaning options) per word\n- Include 1-2 confusables per word (words easily confused in spelling/sound/meaning)\n- For image_prompt: describe a cute, simple, child-friendly cartoon illustration of each word\n- CRITICAL: keep every value concise. Do NOT let the response get cut off — output the COMPLETE closing brackets/braces. A truncated response is useless.";
        break;
      case 'grammar':
        expectedOutputFormat = `{ "grammar": [ { "rule": "rule name", "explanation": "simple explanation", "examples": ["example 1", "example 2", "example 3"], "pattern_template": "Subject + ___ + Object", "transformation_pairs": [ {"original": "I play.", "transformed": "I am playing."} ], "error_examples": [ {"wrong": "He play.", "correct": "He plays."} ] } ] }`;
        categoryRules = "- Extract exactly 1-2 core grammar rules from the text\n- Include simple explanations suitable for children and 3 examples each\n- pattern_template: a fill-in-the-blank structure showing how the rule forms a sentence\n- transformation_pairs: 2-4 pairs showing a transformation (e.g. affirmative->negative, singular->plural, statement->question)\n- error_examples: 2-3 common learner errors with the corrected form";
        break;
      case 'characters':
        expectedOutputFormat = `{ "characters": [ { "name": "name", "role": "teacher/student/friend", "personality": "brave/smart/funny", "image_prompt": "a friendly cartoon [role] named [name] who is [personality], children's book illustration style, bright colors, simple design" } ] }`;
        categoryRules = castRoster
          ? `- REUSE the book's existing recurring characters wherever possible: ${castRoster}. These characters already have established personalities — keep them consistent.\n- Only create a NEW character if the story genuinely needs one not in the roster.\n- Give each character a distinct role, personality, and visual description in image_prompt.`
          : "- Create exactly 2-4 fun characters suitable for children aged 6-12\n- Give them distinct roles, personalities, and visual descriptions in image_prompt\n- Characters should relate to the topic of the lesson.";
        break;
      case 'story':
        expectedOutputFormat = `{ "story": { "title": "story title", "setting": "where it happens", "pages": [ { "text": "story text (2-3 sentences)", "speaker": "character name", "image_prompt": "scene description for illustration", "comprehension_questions": [ {"question": "yes/no or simple WH question", "options": ["a","b","c"], "answer": 0} ] } ] } }`;
        categoryRules = (castRoster
          ? `- Use the book's recurring characters as the speakers: ${castRoster}. Keep their personalities consistent across the story.\n`
          : '') + "- Write exactly 3-5 story pages using the target vocabulary words\n- Make the story engaging and age-appropriate for children 6-12\n- Each page should have a speaker and scene description\n- Each page MUST include 1-2 comprehension_questions with 3 options and the 0-based answer index, so the story has a real reading-comprehension quiz";
        break;
      case 'media':
        expectedOutputFormat = `{ "song_suggestions": [ { "title": "real song title", "topic_relevance": "why it fits this lesson", "search_query": "YouTube search query to find this song" } ], "video_suggestions": [ { "title": "real video title", "topic_relevance": "why it fits this lesson", "search_query": "YouTube search query to find this video" } ] }`;
        categoryRules = "- Suggest exactly 2-3 REAL existing children's songs on YouTube with search queries\n- Suggest exactly 2-3 REAL existing educational videos on YouTube with search queries\n- Songs and videos must be age-appropriate and related to the lesson topic.";
        break;
      case 'dialogues':
        expectedOutputFormat = `{ "dialogues": [ { "title": "dialogue title", "lines": [ {"speaker": "character name", "text": "what they say"} ] } ] }`;
        categoryRules = (castRoster
          ? `- Use the book's recurring characters as the dialogue speakers: ${castRoster}. Keep their personalities consistent.\n`
          : '') + "- Write exactly 1-2 realistic dialogues using the target vocabulary\n- Each dialogue should have 4-6 lines between 2 speakers.";
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
      await logOutcome('ai_error');
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
    //
    // TIME BUDGET (2026-07-30): vocab is the only category that runs TTS on top
    // of the AI call (~24 audio clips). The edge-function wall-clock limit is
    // ~150s; a slow AI response (~60-75s) + TTS at concurrency 3 (~90s) pushed
    // the total past the limit and the function was killed ("non-2xx", no
    // telemetry). Fix: (a) only run TTS if the AI call left enough headroom,
    // (b) raise TTS concurrency 3 -> 5 to halve its wall time. Vocab CONTENT is
    // the essential output — it returns even when TTS is skipped.
    const ttsElapsed = Date.now() - handlerStart;
    const TTS_BUDGET_OK = ttsElapsed < 80000; // leave ~70s for TTS within the ~150s limit
    if ((category === 'vocabulary' || category === 'all') && Array.isArray(enriched.vocabulary) && enriched.vocabulary.length > 0 && TTS_BUDGET_OK) {
      // Word audio.
      const wordInputs = enriched.vocabulary.map((v: any) => String(v.word || '')).filter(Boolean);
      const wordResults = await mapWithConcurrency(wordInputs, 5, (w) =>
        generateAndStoreAudio(w, unitId).then((r) => ({ word: w, url: r.url })),
      );
      const audioMap = new Map(wordResults.filter((r) => r.url).map((r) => [r.word, r.url]));
      // Example-sentence audio (bounded: up to 2x words to limit cost/latency).
      const sentInputs = enriched.vocabulary
        .map((v: any) => ({ word: String(v.word || ''), sentence: String(v.example_sentence || v.context_sentence || '') }))
        .filter((v) => v.word && v.sentence);
      const sentResults = await mapWithConcurrency(sentInputs.slice(0, wordInputs.length * 2), 5, (vi) =>
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

      // Phase 1.1-6: persist generated characters into the book-level library
      // (locked L1 — recurring cast). Upsert by (book_id, name) so re-enriching
      // a unit never duplicates; new fields from generation fill nulls only
      // (don't overwrite a teacher's manual edit). Then link this unit to its
      // characters via unit_characters (the join is what makes a character
      // "appear in this unit" without copying data). Best-effort, non-fatal.
      if (bookId) {
        try {
          const charRows = enriched.characters
            .filter((ch: any) => ch && ch.name)
            .map((ch: any) => ({
              book_id: bookId,
              name: String(ch.name).trim(),
              role: ch.role || null,
              personality: ch.personality || null,
              description: ch.description || null,
              // image_prompt becomes the reusable look_prompt (visual consistency)
              look_prompt: ch.look_prompt || ch.image_prompt || null,
            }));
          if (charRows.length > 0) {
            const { data: upserted } = await sbClient
              .from('characters')
              .upsert(charRows, { onConflict: 'book_id,name', ignoreDuplicates: false })
              .select('id, name');
            // Only fill nulls on conflict (preserve teacher edits to role/personality)
            // by re-running a COALESCE update — handled by the upsert above setting
            // new values; for a stricter "don't overwrite" we'd need per-field logic,
            // but for first-pass library population this is correct: generation is the
            // initial source, later teacher edits in the picker win.
            // Link this unit to its characters.
            if (Array.isArray(upserted) && upserted.length > 0) {
              const joins = upserted.map((c: any) => ({ unit_id: unitId, character_id: c.id }));
              await sbClient
                .from('unit_characters')
                .upsert(joins, { onConflict: 'unit_id,character_id' });
            }
          }
        } catch (charErr: any) {
          console.error('enrich-unit character library persist failed (non-fatal):', charErr?.message || charErr);
        }
      }
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

    // Phase 1.2-5: also write story to the RELATIONAL tables (single emitter —
    // the tables are the canonical source; manifest stays as a read cache for
    // legacy consumers). When the story category was generated, upsert pages +
    // their comprehension questions. Idempotent via UNIQUE(unit_id, page_number).
    // Best-effort, non-fatal: a failure here doesn't fail enrichment.
    if ((category === 'story' || category === 'all') && enriched.story?.pages?.length > 0) {
      try {
        const pages = enriched.story.pages;
        // Resolve each speaker to a book character (continuity, advisor §7.2).
        const pageRows: any[] = [];
        for (let i = 0; i < pages.length; i++) {
          const p = pages[i];
          let speakerCharId: string | null = null;
          if (bookId && p.speaker) {
            const ch = await fetchCharacterByName(sbClient, bookId, String(p.speaker));
            speakerCharId = ch?.id ?? null;
          }
          pageRows.push({
            unit_id: unitId, page_number: i,
            text: String(p.text || ''), speaker: p.speaker ? String(p.speaker) : null,
            speaker_character_id: speakerCharId,
            image_prompt: p.image_prompt ? String(p.image_prompt) : null,
          });
        }
        const { data: upsertedPages } = await sbClient
          .from('story_pages')
          .upsert(pageRows, { onConflict: 'unit_id,page_number' })
          .select('id, page_number');
        // Comprehension questions → linked to their page by order.
        const qRows: any[] = [];
        const pageIdByNum = new Map((upsertedPages || []).map((pg: any) => [pg.page_number, pg.id]));
        let qOrder = 0;
        for (let i = 0; i < pages.length; i++) {
          const pageId = pageIdByNum.get(i) || null;
          for (const q of (pages[i].comprehension_questions || [])) {
            qRows.push({
              unit_id: unitId, story_page_id: pageId,
              question: String(q.question || ''),
              options: Array.isArray(q.options) ? q.options : [],
              answer_index: Number.isInteger(q.answer) ? q.answer : 0,
              order_index: qOrder++,
            });
          }
        }
        if (qRows.length > 0) {
          // Replace-then-insert: re-enriching a unit should give clean questions,
          // not duplicates. There's no natural unique key (story_page_id may be
          // null for legacy rows), so delete this unit's questions first.
          await sbClient.from('story_comprehension_questions').delete().eq('unit_id', unitId)
            .then(() => undefined, () => undefined);
          await sbClient.from('story_comprehension_questions').insert(qRows)
            .then(() => undefined, () => undefined);
        }
        console.log(`enrich-unit STORY: ${pageRows.length} pages, ${qRows.length} questions written relationally`);
      } catch (storyErr: any) {
        console.error('enrich-unit story relational write failed (non-fatal):', storyErr?.message || storyErr);
      }
    }

    // Phase 1.3-5: also write dialogues to the RELATIONAL tables (single emitter —
    // the tables are the canonical source; manifest stays as a read cache for
    // legacy consumers). When the dialogues category was generated, flatten all
    // dialogue lines into ordered rows and resolve speakers to book characters.
    // Idempotent via UNIQUE(unit_id, order_index). Best-effort, non-fatal.
    if ((category === 'dialogues' || category === 'all') && Array.isArray(enriched.dialogues) && enriched.dialogues.length > 0) {
      try {
        const lineRows: any[] = [];
        let globalOrder = 0;
        for (let d = 0; d < enriched.dialogues.length; d++) {
          const dialogue = enriched.dialogues[d];
          const lines = Array.isArray(dialogue?.lines) ? dialogue.lines : [];
          for (const line of lines) {
            const speakerName = line?.speaker ? String(line.speaker).trim() : null;
            let speakerCharId: string | null = null;
            if (bookId && speakerName) {
              const ch = await fetchCharacterByName(sbClient, bookId, speakerName);
              speakerCharId = ch?.id ?? null;
            }
            lineRows.push({
              unit_id: unitId,
              order_index: globalOrder,
              dialogue_index: d,
              speaker_character_id: speakerCharId,
              speaker_override_name: speakerCharId ? null : speakerName, // override only if NOT resolved
              text: String(line?.text || ''),
              translation: line?.translation ? String(line.translation) : null,
            });
            globalOrder++;
          }
        }
        if (lineRows.length > 0) {
          // Delete-then-insert (like story questions): re-enriching gives clean
          // lines, not duplicates. The UNIQUE(unit_id, order_index) also guards
          // against partial overlap, but a full replace is cleaner for dialogues
          // since line counts may change between enrichments.
          await sbClient.from('dialogue_lines').delete().eq('unit_id', unitId)
            .then(() => undefined, () => undefined);
          await sbClient.from('dialogue_lines').insert(lineRows)
            .then(() => undefined, () => undefined);
        }
        console.log(`enrich-unit DIALOGUE: ${lineRows.length} lines across ${enriched.dialogues.length} dialogues written relationally`);
      } catch (dlgErr: any) {
        console.error('enrich-unit dialogue relational write failed (non-fatal):', dlgErr?.message || dlgErr);
      }
    }

    // Phase 1.4-5: also write grammar to the RELATIONAL table (single emitter —
    // grammar_rules is the canonical source; manifest stays as a read cache for
    // legacy consumers). When the grammar category was generated, upsert rules.
    // Idempotent via UNIQUE(unit_id, rule). Best-effort, non-fatal.
    if ((category === 'grammar' || category === 'all') && Array.isArray(enriched.grammar) && enriched.grammar.length > 0) {
      try {
        const ruleRows = enriched.grammar
          .filter((g: any) => g && g.rule)
          .map((g: any, i: number) => ({
            unit_id: unitId,
            order_index: i,
            rule: String(g.rule).trim(),
            explanation: g.explanation ? String(g.explanation) : null,
            examples: Array.isArray(g.examples) ? g.examples : [],
            pattern_template: g.pattern_template ? String(g.pattern_template) : null,
            transformation_pairs: Array.isArray(g.transformation_pairs) ? g.transformation_pairs : [],
            error_examples: Array.isArray(g.error_examples) ? g.error_examples : [],
          }));
        if (ruleRows.length > 0) {
          await sbClient
            .from('grammar_rules')
            .upsert(ruleRows, { onConflict: 'unit_id,rule' })
            .then(() => undefined, () => undefined);
        }
        console.log(`enrich-unit GRAMMAR: ${ruleRows.length} rules written relationally`);
      } catch (grammErr: any) {
        console.error('enrich-unit grammar relational write failed (non-fatal):', grammErr?.message || grammErr);
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

    await logOutcome('ok');
    return {
      success: true,
      unitId,
      category,
      enriched: mergedManifest,
    };
  });
});
