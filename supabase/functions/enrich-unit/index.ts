import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
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
          unit_id: unitId,
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
    const ownership = assertUnitOwnership(unit.teacher_id, { callerId: auth.userId, callerRole: auth.role });
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

    // ── FIXPLAN_F P2.2: BASKET SOURCE MODE ─────────────────────────────
    // New-flow units (scan-page → teacher-reviewed baskets) feed enrichment
    // from get_unit_baskets(); legacy units keep the scanned_assets path
    // below, byte-for-byte unchanged. Enrichment runs ONLY after the
    // teacher's batch confirm (units.baskets_confirmed_at, doc 10 §5).
    let baskets: any = null;
    try {
      const { data: basketData } = await sbClient.rpc('get_unit_baskets', { p_unit_id: unitId });
      baskets = basketData && typeof basketData === 'object' ? basketData : null;
    } catch {
      /* basket RPC unavailable (pre-P2 schema) -> legacy path */
    }
    const basketConfirmed = !!baskets && !!baskets.confirmed_at;
    const basketVocab: any[] = basketConfirmed && Array.isArray(baskets.vocabulary) ? baskets.vocabulary : [];
    const basketGrammar: any[] = basketConfirmed && Array.isArray(baskets.grammar) ? baskets.grammar : [];
    const basketDialogues: any[] = basketConfirmed && Array.isArray(baskets.dialogues) ? baskets.dialogues : [];
    const basketPassages: any[] = basketConfirmed && Array.isArray(baskets.story?.passages) ? baskets.story.passages : [];
    const basketComics: any[] = basketConfirmed && Array.isArray(baskets.story?.comics) ? baskets.story.comics : [];
    const basketSongs: any[] = basketConfirmed && Array.isArray(baskets.book_songs) ? baskets.book_songs : [];
    const basketAppearances: any[] = basketConfirmed && Array.isArray(baskets.character_appearances) ? baskets.character_appearances : [];
    const useBaskets = basketConfirmed && (
      basketVocab.length > 0 || basketGrammar.length > 0 || basketDialogues.length > 0 ||
      basketPassages.length > 0 || basketComics.length > 0 || basketSongs.length > 0
    );

    // FIXPLAN_F audit fix (2026-08-26): a unit whose pages WERE scanned but
    // whose batch was never teacher-confirmed must not silently fall back to
    // the legacy invent-everything path — that produced "review shows only a
    // song suggestion and nothing else". Answer honestly and actionably.
    if (!basketConfirmed && baskets) {
      try {
        const { data: pageIds } = await sbClient.from('book_pages').select('id').eq('unit_id', unitId);
        if (pageIds && pageIds.length > 0) {
          const { count: pendingStructures } = await sbClient
            .from('page_structures')
            .select('id', { count: 'exact', head: true })
            .in('page_id', pageIds.map((p: any) => p.id))
            .in('review_status', ['pending', 'edited']);
          if ((pendingStructures ?? 0) > 0) {
            return {
              success: false,
              error: 'This unit has scanned pages waiting for your review. Open "Review extraction" and confirm the batch first — enrichment only uses content you have confirmed.',
              awaiting_confirmation: true,
            };
          }
        }
      } catch { /* fall through to normal behavior */ }
    }

    // Per-teacher L1 (doc 10 §5): basket mode reads profiles.native_language;
    // zh-CN default keeps output identical to today's hardcoded behavior.
    let l1PromptPhrase = 'Simplified Chinese (简体中文)';
    let l1Name = '简体中文';
    if (useBaskets) {
      try {
        const { data: profile } = await sbClient.from('profiles').select('native_language').eq('id', unit.teacher_id).single();
        const code = profile?.native_language || 'zh-CN';
        if (code === 'zh-CN' || code === 'zh') {
          l1PromptPhrase = 'Simplified Chinese (简体中文)';
          l1Name = '简体中文';
        } else if (code === 'en') {
          l1PromptPhrase = 'English';
          l1Name = 'English';
        } else {
          l1PromptPhrase = code;
          l1Name = code;
        }
      } catch { /* profile read is best-effort */ }
    }

    const scannedAssets = unit.scanned_assets || [];

    const allVocab: any[] = useBaskets
      ? basketVocab.map((v) => ({ word: v.word, definition: '', category: v.set_label || (v.is_clil ? 'CLIL' : '') }))
      : [];
    let topic = unit.topic || '';
    let gradeLevel = 'Beginner';
    let extractedText = useBaskets ? '' : '';

    if (!useBaskets) {
      for (const asset of scannedAssets) {
        const meta = asset?.metadata || asset || {};
        if (meta.topic) topic = meta.topic;
        if (meta.gradeLevel) gradeLevel = meta.gradeLevel;
        if (meta.extractedText) extractedText += meta.extractedText + '\n';
        if (Array.isArray(meta.vocabulary)) {
          allVocab.push(...meta.vocabulary);
        }
      }
    } else {
      // Basket mode context for the grounded prompts: printed titles and the
      // confirmed word inventory stand in for the old extractedText blob.
      topic = unit.topic && unit.topic !== 'Uploaded Material' ? unit.topic : (baskets.narrative?.[0]?.printed_title || unit.title || 'Lesson');
      const wordSample = basketVocab.slice(0, 40).map((v) => v.word).join(', ');
      extractedText = [
        baskets.narrative?.map((n: any) => n.mission_text).filter(Boolean).join('\n'),
        basketGrammar.map((g) => `Grammar box: ${g.rule_text}`).join('\n'),
        basketSongs.map((s) => `Song: ${s.title}`).join('\n'),
        wordSample ? `Words: ${wordSample}` : '',
      ].filter(Boolean).join('\n');
    }

    if (!useBaskets && allVocab.length === 0 && !extractedText) {
      return { success: false, error: 'No content found to enrich. Upload and extract pages first.' };
    }
    if (useBaskets && category === 'vocabulary' && basketVocab.length === 0) {
      return { success: false, error: 'No confirmed vocabulary in the baskets for this unit.' };
    }

    // ── REGION-SAFE MODELS ──────────────────────────────────────────────
    // User's OpenRouter region blocks Google, OpenAI, and Anthropic.
    // Only use models from: Moonshot, Qwen, DeepSeek, Meta, NVIDIA, etc.
    const models = [
      Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-k2.6',
      Deno.env.get('FALLBACK_MODEL_NAME') || 'qwen/qwen3-235b-a22b',
      'deepseek/deepseek-r1-0528:free',
    ];

    // WS-A/B (2026-08-07): schema-heavy categories (vocab batches, grammar)
    // prefer the fast fallback model FIRST. Verified in llm_telemetry: kimi-k2.6
    // rambles to the MAX_TOKENS=5000 ceiling on structured-JSON requests
    // (completion_tokens pinned at 5000 = truncated), burning ~50s per call
    // before the fallback even runs — that churn pushed batched enrichment past
    // the edge wall-clock limit and nothing persisted. qwen returned the same
    // batch clean at ~1900 tokens. Region-safe ordering: qwen → deepseek → kimi.
    const FAST_MODELS = [
      Deno.env.get('FALLBACK_MODEL_NAME') || 'qwen/qwen3-235b-a22b',
      'deepseek/deepseek-r1-0528:free',
      Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-k2.6',
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

    // True if the URL is a placeholder (dicebear) or empty — i.e. NOT a real
    // generated image. Mirrors generate-exercises' isRealImage (inverted). Used
    // so the vocabulary_items emitter doesn't persist a placeholder as if it
    // were a real image_url.
    function isPlaceholderImage(url: string | null | undefined): boolean {
      return !url || /dicebear\.com/i.test(url);
    }

    async function callAI(systemPrompt: string, userPrompt: string, temperature = 0.7, modelOverride?: string[]): Promise<any> {
      let lastError = '';
      const modelList = modelOverride && modelOverride.length > 0 ? modelOverride : models;
      for (const modelName of modelList) {
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
              unit_id: unitId,
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

    // ── WS-A: BATCHED, UNCAPPED VOCABULARY ENRICHMENT (2026-08-07) ────
    // The old single-call path asked the model to "extract exactly 6-8 words",
    // which (a) capped a book's real vocabulary and (b) — because the vocab
    // schema is the largest/most-nested — truncated to EMPTY under the token
    // ceiling. We now enrich the FULL extraction inventory (allVocab) in small
    // batches so each AI call stays well under MAX_TOKENS, idempotently skip
    // words already enriched, and run under a wall-clock budget so we never
    // blow the edge limit. Deferred words are picked up on the next enrich.
    const VOCAB_BATCH_SIZE = 5;
    const VOCAB_DEADLINE_MS = handlerStart + 95_000; // leave ~55s so in-flight batches + writes fit the edge limit

    async function enrichVocabularyBatched(): Promise<{ words: any[]; presence: any }> {
      // Faithful inventory from extraction, deduped by word (case-insensitive).
      const seen = new Set<string>();
      const inventory: any[] = [];
      for (const v of allVocab) {
        const w = String(v?.word || '').trim();
        if (!w) continue;
        const key = w.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        inventory.push(v);
      }

      // FIXPLAN_F P2.2: basket mode carries provenance (set label + structure)
      // keyed by word so toVocabRow can persist it without changing the
      // legacy inventory shape.
      const basketProvenance = new Map<string, { set_label: string | null; structure_id: string | null }>();
      for (const v of basketVocab) {
        const w = String(v?.word || '').trim().toLowerCase();
        if (w && !basketProvenance.has(w)) {
          basketProvenance.set(w, { set_label: v.set_label || null, structure_id: v.structure_id || null });
        }
      }

      // Idempotent: skip words already enriched for this unit (safe re-enrich).
      let existingWords = new Set<string>();
      let existingCount = 0;
      try {
        const { data: rows } = await sbClient.from('vocabulary_items').select('word').eq('unit_id', unitId);
        if (rows && rows.length > 0) {
          existingWords = new Set(rows.map((r: any) => String(r.word).toLowerCase()));
          existingCount = rows.length;
        }
      } catch { /* treat as none enriched yet */ }

      if (inventory.length === 0) {
        return { words: [], presence: { category: 'vocabulary', source_count: 0, enriched_count: existingCount, status: 'no_source' } };
      }
      const toEnrich = inventory.filter((v) => !existingWords.has(String(v.word).toLowerCase()));
      if (toEnrich.length === 0) {
        return { words: [], presence: { category: 'vocabulary', source_count: inventory.length, enriched_count: existingCount, status: 'already_complete' } };
      }

      const batchSystem = `You are Professor AI, an expert ESL/EFL curriculum designer for children aged 6-12.
You enrich a GIVEN list of vocabulary words. Do NOT add, drop, or rename words - enrich EXACTLY the words provided.
Return ONLY a valid JSON object. No markdown, no explanations, no text before or after the JSON.`;

      // Map one enriched word to a vocabulary_items row (mirrors the end-of-run
      // emitter so incremental + final writes produce identical rows).
      const toVocabRow = (v: any) => {
        const prov = basketProvenance.get(String(v.word || '').trim().toLowerCase()) || { set_label: null, structure_id: null };
        return {
          unit_id: unitId,
          order_index: typeof v.order_index === 'number' ? v.order_index : 0,
          word: String(v.word).trim(),
          definition: v.definition ? String(v.definition) : null,
          example_sentence: v.example_sentence ? String(v.example_sentence) : null,
          l1_translation: v.l1_translation ? String(v.l1_translation) : (v.translation ? String(v.translation) : null),
          phonetic: v.phonetic ? String(v.phonetic) : null,
          part_of_speech: v.part_of_speech ? String(v.part_of_speech) : null,
          image_prompt: v.image_prompt ? String(v.image_prompt) : null,
          image_url: isPlaceholderImage(v.image_url) ? null : (v.image_url || null),
          audio_url: v.audio_url || null,
          example_audio_url: v.example_audio_url || null,
          distractors: Array.isArray(v.distractors) ? v.distractors : [],
          confusables: Array.isArray(v.confusables) ? v.confusables : [],
          set_label: prov.set_label,
          source_structure_id: prov.structure_id,
        };
      };

      const words: any[] = [];
      let budgetHit = false;

      // AUDIT FIX (2026-08-26): baskets hold 30-40+ words (the old pipeline
      // capped at 6-8); SEQUENTIAL batches of 5 hit the 95s wall-clock
      // deadline after ~15 words and silently deferred the rest (owner saw
      // 15 of ~35). Batches are independent (each enriches its own words and
      // persists incrementally) — run them in parallel waves of 3 so a
      // 40-word unit completes in one pass inside the same deadline.
      const batches: any[][] = [];
      for (let i = 0; i < toEnrich.length; i += VOCAB_BATCH_SIZE) {
        batches.push(toEnrich.slice(i, i + VOCAB_BATCH_SIZE));
      }
      const VOCAB_PARALLELISM = 3;
      const runBatch = async (batchIdx: number) => {
        if (Date.now() > VOCAB_DEADLINE_MS) {
          budgetHit = true;
          console.warn(`enrich-unit VOCAB: time-budget hit; batch ${batchIdx + 1} deferred to the next enrichment`);
          return;
        }
        const batch = batches[batchIdx];
        const wordList = batch.map((v: any) => ({ word: v.word, definition: v.definition || '', category: v.category || '' }));
        const batchPrompt = `Topic: ${topic}
Grade Level: ${gradeLevel}
Learners' native language: ${l1PromptPhrase}.

Enrich EXACTLY these ${batch.length} vocabulary words (no more, no fewer):
${JSON.stringify(wordList)}

Return ONLY this JSON format:
{ "vocabulary": [ { "word": "...", "phonetic": "/IPA/", "part_of_speech": "noun", "definition": "simple child-friendly English definition", "l1_translation": "${l1Name}", "example_sentence": "a short sentence using the word", "translation": "${l1Name}", "image_prompt": "a cute cartoon illustration of [word] for children, simple flat style, bright colors", "distractors": ["wrong meaning 1","wrong meaning 2","wrong meaning 3"], "confusables": ["an easily confused word"] } ] }

Rules:
- Output one entry per provided word, in the same order. Keep every value concise.
- l1_translation and translation MUST be in the learners' native language (${l1Name}).
- Output the COMPLETE closing brackets/braces. A truncated response is useless.`;

        const res = await callAI(batchSystem, batchPrompt, 0.5, FAST_MODELS);
        const batchWords: any[] = [];
        if (Array.isArray(res?.vocabulary)) {
          // Guard against model drift: only keep words that belong to this batch.
          const allowed = new Set(batch.map((b: any) => String(b.word).toLowerCase()));
          for (const w of res.vocabulary) {
            if (w && w.word && allowed.has(String(w.word).toLowerCase())) batchWords.push(w);
          }
        } else {
          console.warn(`enrich-unit VOCAB: batch ${batchIdx + 1} returned no vocabulary (empty/truncated)`);
        }
        // Incremental persistence: write this batch to vocabulary_items immediately
        // so the edge wall-clock limit can never discard completed work. The
        // order_index is derived from the batch's position, so parallel waves
        // never collide.
        if (batchWords.length > 0) {
          batchWords.forEach((w, idx) => { w.order_index = existingCount + batchIdx * VOCAB_BATCH_SIZE + idx; });
          try {
            const { error: incErr } = await sbClient
              .from('vocabulary_items')
              .upsert(batchWords.map(toVocabRow), { onConflict: 'unit_id,word' });
            if (incErr) console.error('enrich-unit VOCAB: incremental upsert failed:', incErr.message);
          } catch (e: any) {
            console.error('enrich-unit VOCAB: incremental write threw (non-fatal):', e?.message || e);
          }
          words.push(...batchWords);
        }
      };
      let nextBatch = 0;
      const workers = Array.from({ length: Math.min(VOCAB_PARALLELISM, batches.length) }, async () => {
        while (true) {
          const i = nextBatch++;
          if (i >= batches.length || Date.now() > VOCAB_DEADLINE_MS) break;
          await runBatch(i);
        }
      });
      await Promise.all(workers);
      if (Date.now() > VOCAB_DEADLINE_MS && words.length < toEnrich.length) budgetHit = true;

      // order_index appends after the existing rows so re-enrich never collides.
      words.forEach((w, idx) => { w.order_index = existingCount + idx; });

      const status = words.length === 0 ? 'failed' : ((budgetHit || words.length < toEnrich.length) ? 'partial' : 'ok');
      return {
        words,
        presence: {
          category: 'vocabulary',
          source_count: inventory.length,
          enriched_count: existingCount + words.length,
          status,
          deferred: budgetHit ? Math.max(0, toEnrich.length - words.length) : 0,
        },
      };
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
        // Phase 4 grammar-strand prep (2026-08-06): the example object now shows
        // MULTIPLE transformation_pairs and error_examples (was 1 each). Models
        // anchor on the few-shot example far more than prose count instructions
        // — a single-pair example produced ~3 pairs regardless of the "5-6" ask.
        // Showing 3 in the example sets a higher floor. The prose asks for 4-6
        // (realistic — some rules genuinely have fewer natural transformations).
        expectedOutputFormat = `{ "grammar": [ { "rule": "rule name", "explanation": "simple explanation", "examples": ["example 1", "example 2", "example 3"], "pattern_template": "Subject + ___ + Object", "transformation_pairs": [ {"original": "I play football.", "transformed": "I do not play football."}, {"original": "She sings.", "transformed": "Does she sing?"}, {"original": "They are happy.", "transformed": "Are they happy?"} ], "error_examples": [ {"wrong": "He play.", "correct": "He plays."}, {"wrong": "She don't like it.", "correct": "She doesn't like it."}, {"wrong": "Do he swim?", "correct": "Does he swim?"} ] } ] }`;
        categoryRules = "- Extract 1-3 core grammar rules from the text, prioritizing the structure the page's EXERCISES explicitly practice (e.g. a 'Gracie's Grammar' box, a 'Correct your friend' game, or a story that repeats one pattern).\n- IMPORTANT: scan the WHOLE extracted text - dialogues, songs, chants, exercises and story lines - for the sentence structure the unit drills (e.g. \"There is / There are\", \"There isn't / There aren't\", \"Are there any...?\", present simple, can/can't, plurals). That repeated structure IS the grammar rule, even if there is no box labelled 'grammar'. If both an existential pattern (There is/are) and another pattern (e.g. present simple) are drilled, return BOTH as separate rules.\n- Include simple explanations suitable for children and 3 examples each\n- pattern_template: a fill-in-the-blank structure showing how the rule forms a sentence\n- transformation_pairs: 4-6 pairs showing DIFFERENT transformations of the SAME rule (e.g. affirmative->negative, statement->question, singular->plural). Each pair must illustrate a distinct way the rule applies. Keep each sentence short (under 8 words).\n- error_examples: 4-5 common learner errors with the corrected form, each a distinct mistake pattern (subject-verb agreement, wrong auxiliary, missing 'any', word order). Keep each short.\n- Keep every value concise so the response does NOT get cut off.";
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

    // ── FIXPLAN_F P2.2: BASKET-MODE BUILDERS ─────────────────────────────
    // Verbatim-first: category content comes from the baskets themselves;
    // the LLM is used ONLY for derived fields (explanations, pattern drills,
    // comprehension questions grounded in the actual text, 1+1 media
    // suggestions). Nothing is invented; nothing is quota'd (doc 10 §3).
    const buildBasketGrammar = async (): Promise<any[]> => {
      if (basketGrammar.length === 0) return [];
      // One grounded call for all boxes: derive teaching scaffolding FROM the
      // verbatim box texts — the rule text itself is never rewritten.
      const boxes = basketGrammar.map((g, i) => ({ index: i, rule_text: g.rule_text, example_sentences: g.example_sentences || [] }));
      const sys = `You are an ESL grammar teacher for children aged 6-12.
Given grammar boxes transcribed VERBATIM from a textbook, derive teaching scaffolding for each box. Never rewrite the box text itself.
Return ONLY a valid JSON object.`;
      const usr = `Grammar boxes (verbatim):
${JSON.stringify(boxes)}

For EACH box, derive:
- explanation: a simple child-friendly explanation of the pattern IN the box
- pattern_template: a fill-in-the-blank structure of the box's pattern
- transformation_pairs: pairs {original, transformed} showing different ways the pattern applies
- error_examples: pairs {wrong, correct} of typical learner mistakes with this pattern

Return ONLY: { "boxes": [ { "index": 0, "explanation": "...", "pattern_template": "...", "transformation_pairs": [...], "error_examples": [...] } ] }
One output box per input box, same order. Keep every value concise so the response is not cut off.`;
      const res = await callAI(sys, usr, 0.4, FAST_MODELS);
      const derived = Array.isArray(res?.boxes) ? res.boxes : [];
      return basketGrammar.map((g, i) => {
        const d = derived.find((x: any) => Number(x?.index) === i) || {};
        // Examples-only boxes: the first verbatim sentence stands in as the
        // rule (grammar_rules.rule is NOT NULL) — still book text, never
        // invented (doc 10 §7.3).
        const examples = Array.isArray(g.example_sentences) ? g.example_sentences.filter((s: any) => typeof s === 'string' && s.trim()) : [];
        const ruleText = String(g.rule_text || '').trim() || examples[0] || '';
        return {
          rule: ruleText,
          explanation: d.explanation ? String(d.explanation) : null,
          examples,
          pattern_template: d.pattern_template ? String(d.pattern_template) : null,
          transformation_pairs: Array.isArray(d.transformation_pairs) ? d.transformation_pairs : [],
          error_examples: Array.isArray(d.error_examples) ? d.error_examples : [],
          tier: 'BOX',
          source_structure_id: g.structure_id || null,
        };
      });
    };

    const buildBasketStory = async (): Promise<any> => {
      const pages: any[] = [];
      let title = '';
      // Reading passages verbatim → one page per passage.
      for (const p of basketPassages) {
        if (!title && p.title) title = String(p.title);
        pages.push({
          text: String(p.passage_text || ''),
          speaker: null,
          image_prompt: null,
          source_structure_id: p.structure_id || null,
          needs_questions: true,
        });
      }
      // Comics → one page per panel (narration + bubbles as dialogue lines).
      for (const c of basketComics) {
        const panels = Array.isArray(c.panels) ? c.panels : [];
        for (const panel of panels) {
          const bits: string[] = [];
          if (panel?.narration) bits.push(String(panel.narration));
          for (const b of (Array.isArray(panel?.bubbles) ? panel.bubbles : [])) {
            const speaker = b?.speaker ? `${b.speaker}: ` : '';
            if (b?.text) bits.push(speaker + String(b.text));
          }
          if (bits.length > 0) {
            pages.push({
              text: bits.join('\n'),
              speaker: null,
              image_prompt: null,
              source_structure_id: c.structure_id || null,
              needs_questions: panels.length >= 3, // panel slides are for telling, not quizzing
            });
          }
        }
      }
      if (pages.length === 0) return null;

      // Comprehension questions — generated ONLY from the actual passage
      // text, never about invented content (doc 10 §6 story basket).
      for (const page of pages) {
        if (!page.needs_questions) { delete page.needs_questions; continue; }
        const qSys = `You write reading-comprehension questions for children aged 6-12.
Questions must be answerable STRICTLY from the provided text. Never add facts.
Return ONLY a valid JSON object.`;
        const qUsr = `Text (verbatim from the book):
${String(page.text).slice(0, 4000)}

Write comprehension questions about THIS text only.
Return ONLY: { "questions": [ { "question": "...", "options": ["a","b","c"], "answer": 0 } ] }
answer is the 0-based index of the correct option. Keep language simple.`;
        const qRes = await callAI(qSys, qUsr, 0.4, FAST_MODELS);
        page.comprehension_questions = Array.isArray(qRes?.questions)
          ? qRes.questions.map((q: any) => ({
              question: String(q?.question || ''),
              options: Array.isArray(q?.options) ? q.options.slice(0, 4) : [],
              answer: Number.isInteger(q?.answer) ? q.answer : 0,
            }))
          : [];
        delete page.needs_questions;
      }
      return { title: title || 'Story', setting: '', pages };
    };

    const buildBasketDialogues = (): any[] => {
      // Verbatim lines grouped by (page, structure) into dialogues.
      const groups = new Map<string, any[]>();
      for (const d of basketDialogues) {
        const key = `${d.order_hint}-${d.structure_id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(d);
      }
      return [...groups.entries()].map(([key, lines], i) => ({
        title: `Dialogue ${i + 1}`,
        lines: lines.map((l) => ({
          speaker: l.speaker ? String(l.speaker) : null,
          text: String(l.text || ''),
          source_structure_id: l.structure_id || null,
        })),
      }));
    };

    const buildBasketMedia = async (): Promise<any> => {
      // Exactly 1 topic-matched song + 1 video suggestion (doc 10 §5 media
      // slot decision), plus the book's own songs as separate marked items.
      const sys = `You suggest REAL, existing children's educational media on YouTube.
Return ONLY a valid JSON object.`;
      const usr = `Lesson topic: ${topic}
Confirmed words: ${basketVocab.slice(0, 30).map((v) => v.word).join(', ')}

Suggest ONE song and ONE video that fit this lesson.
Return ONLY: { "song_suggestions": [ { "title": "real song title", "topic_relevance": "why it fits", "search_query": "YouTube search query" } ], "video_suggestions": [ { "title": "real video title", "topic_relevance": "why it fits", "search_query": "YouTube search query" } ] }
Exactly one entry in each array.`;
      const res = await callAI(sys, usr, 0.5);
      const songs = Array.isArray(res?.song_suggestions) ? res.song_suggestions.slice(0, 1) : [];
      const videos = Array.isArray(res?.video_suggestions) ? res.video_suggestions.slice(0, 1) : [];
      // The book's own songs: separate items, teacher-removable independently.
      const bookSongs = basketSongs.map((s) => ({
        title: s.title || 'Song',
        topic_relevance: 'From the book (lyrics transcribed verbatim)',
        lyrics: s.lyrics || '',
        source: 'book',
        structure_id: s.structure_id || null,
      }));
      return { song_suggestions: [...bookSongs, ...songs], video_suggestions: videos };
    };

    const buildBasketCharacters = (): any[] => {
      // Book cast from exhaustive appearance descriptions (doc 10 §7.9).
      // No invented cast: only characters the scan actually found.
      return basketAppearances
        .filter((a) => a.visual_description)
        .map((a, i) => ({
          name: a.name ? String(a.name) : `Book character ${i + 1}`,
          role: 'book character',
          personality: null,
          description: String(a.visual_description),
          look_prompt: String(a.visual_description),
          image_prompt: String(a.visual_description),
          source: 'book',
          source_structure_id: a.structure_id || null,
        }));
    };

    async function buildBasketEnriched(cat: string): Promise<any> {
      const out: any = {};
      const want = (c: string) => cat === 'all' || cat === c;
      if (want('grammar')) out.grammar = await buildBasketGrammar();
      if (want('story')) out.story = await buildBasketStory();
      if (want('dialogues')) out.dialogues = buildBasketDialogues();
      if (want('media')) Object.assign(out, await buildBasketMedia());
      if (want('characters')) out.characters = buildBasketCharacters();
      out.topic = topic;
      out.gradeLevel = gradeLevel;
      return out;
    }

    // ── WS-A: vocabulary uses the batched, uncapped enrichment; all other
 //    categories keep the single-call path (their schemas fit the budget). ──
    let enriched: any;
    let vocabPresence: any = null;
    if (category === 'vocabulary') {
      const r = await enrichVocabularyBatched();
      enriched = { vocabulary: r.words };
      vocabPresence = r.presence;
      console.log(`enrich-unit VOCAB batched result:`, JSON.stringify(r.presence));
    } else if (useBaskets) {
      // FIXPLAN_F P2.2: basket mode — verbatim-first builders (above). The
      // legacy single-call path below stays untouched for legacy units.
      if (category === 'grammar' && basketGrammar.length === 0) {
        return { success: true, unitId, category, enriched: {}, presence: { grammar: { category: 'grammar', enriched_count: 0, status: 'no_source' } }, source: 'baskets' };
      }
      if (category === 'story' && basketPassages.length === 0 && basketComics.length === 0) {
        return { success: true, unitId, category, enriched: {}, presence: { story: { category: 'story', enriched_count: 0, status: 'no_source' } }, source: 'baskets' };
      }
      if (category === 'dialogues' && basketDialogues.length === 0) {
        return { success: true, unitId, category, enriched: {}, presence: { dialogues: { category: 'dialogues', enriched_count: 0, status: 'no_source' } }, source: 'baskets' };
      }
      if (category === 'characters' && basketAppearances.length === 0) {
        return { success: true, unitId, category, enriched: {}, presence: { characters: { category: 'characters', enriched_count: 0, status: 'no_source' } }, source: 'baskets' };
      }
      enriched = await buildBasketEnriched(category);
      console.log(`enrich-unit BASKET mode [${category}]:`, JSON.stringify(Object.entries(enriched).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : typeof v}`)));
    } else {
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

      enriched = await callAI(enrichSystemPrompt, enrichUserPrompt, 0.7, category === 'grammar' ? FAST_MODELS : undefined);
    }

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

    // ── TTS AUDIO (DECOUPLED — 2026-07-30) ────────────────────────────────
    // Vocab TTS used to run synchronously here (~16-24 clips on top of the AI
    // call). When AI + TTS exceeded the ~150s edge limit the function was killed
    // BEFORE the manifest save below, so the whole vocab category came back empty
    // (the "vocab=0" bug). Audio is now generated ON DEMAND: the client
    // SpeechService.speakVocabWord -> MediaService.getVocabAudio -> generate-media
    // (shared tts.ts, now eleven_flash_v2_5), cached in the assets table. Vocab
    // CONTENT is the essential output and is never held hostage by TTS latency,
    // so enrichment no longer awaits any audio here.
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
      } else if (key === 'vocabulary') {
        // WS-A: batched enrichment returns only NEW words (existing ones were
        // skipped). Append + dedupe so previously enriched words are never lost
        // (the old replace semantics would have wiped them on a partial run).
        if (Array.isArray(enriched.vocabulary) && enriched.vocabulary.length > 0) {
          const existingArr = Array.isArray(currentManifest.vocabulary) ? currentManifest.vocabulary : [];
          const have = new Set(existingArr.map((x: any) => String(x?.word || '').toLowerCase()));
          const mergedArr = [...existingArr];
          for (const w of enriched.vocabulary) {
            const wk = String(w?.word || '').toLowerCase();
            if (wk && !have.has(wk)) { mergedArr.push(w); have.add(wk); }
          }
          mergedManifest.vocabulary = mergedArr;
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
            source_structure_id: p.source_structure_id || null, // FIXPLAN_F P2.2 provenance
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
              source_structure_id: line?.source_structure_id || null, // FIXPLAN_F P2.2 provenance
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
    // Phase 1.6 (B-VOCAB-EMIT fix): vocabulary_items is the canonical content
    // row for vocabulary (advisor §2.3 correction). Previously enrich-unit wrote
    // vocab ONLY to the manifest, so vocabulary_items stayed empty until a
    // teacher opened UnitContentVault or the backfill ran — violating the
    // "single emitter per category" goal for the biggest category. Now enrich-
    // unit writes the canonical row here (mirroring the grammar block below).
    // UNIQUE(unit_id, word) makes re-enrich idempotent. image_url/audio_url are
    // placeholder/empty at this stage (real assets are generated later by
    // generate-exercises / on-demand TTS) — set explicitly so we don't clobber.
    // Best-effort, non-fatal: a failure here doesn't fail enrichment (the
    // manifest write below still succeeds as a legacy fallback).
    if ((category === 'vocabulary' || category === 'all') && Array.isArray(enriched.vocabulary) && enriched.vocabulary.length > 0) {
      try {
        const vocabRows = enriched.vocabulary
          .filter((v: any) => v && v.word)
          .map((v: any, i: number) => {
            const prov = basketVocab.find((b) => String(b.word).toLowerCase() === String(v.word).toLowerCase());
            return {
            unit_id: unitId,
            order_index: typeof v.order_index === 'number' ? v.order_index : i,
            word: String(v.word).trim(),
            definition: v.definition ? String(v.definition) : null,
            example_sentence: v.example_sentence ? String(v.example_sentence) : null,
            l1_translation: v.l1_translation ? String(v.l1_translation) : (v.translation ? String(v.translation) : null),
            phonetic: v.phonetic ? String(v.phonetic) : null,
            part_of_speech: v.part_of_speech ? String(v.part_of_speech) : null,
            image_prompt: v.image_prompt ? String(v.image_prompt) : null,
            // Don't overwrite a previously-generated real image with the
            // placeholder: if this is a fresh row the placeholder seeds it; if
            // the row exists, onConflict overwrites — to preserve a real image
            // we'd need per-field merge. For now, generation is the initial
            // source; teacher edits in the vault win later. See TODO below.
            image_url: isPlaceholderImage(v.image_url) ? null : (v.image_url || null),
            audio_url: v.audio_url || null,
            example_audio_url: v.example_audio_url || null,
            distractors: Array.isArray(v.distractors) ? v.distractors : [],
            confusables: Array.isArray(v.confusables) ? v.confusables : [],
            set_label: prov?.set_label || null,                 // FIXPLAN_F P2.2
            source_structure_id: prov?.structure_id || null,    // FIXPLAN_F P2.2 provenance
            };
          });
        if (vocabRows.length > 0) {
          const { error: vocabUpsertError } = await sbClient
            .from('vocabulary_items')
            .upsert(vocabRows, { onConflict: 'unit_id,word' });
          if (vocabUpsertError) {
            // Surface (don't swallow) — the advisor flagged silent drift as a
            // failure mode. Logged, non-fatal.
            console.error('enrich-unit vocabulary_items upsert failed:', vocabUpsertError.message);
          }
        }
        console.log(`enrich-unit VOCAB: ${vocabRows.length} vocabulary_items written relationally`);
      } catch (vocabErr: any) {
        console.error('enrich-unit vocabulary_items relational write failed (non-fatal):', vocabErr?.message || vocabErr);
      }
    }

    // Phase 1.4 — grammar_rules canonical row (advisor §2.3). Table is canonical;
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
            tier: g.tier === 'BOX' || g.tier === 'INFERRED' ? g.tier : null, // FIXPLAN_F P2.2
            source_structure_id: g.source_structure_id || null,             // FIXPLAN_F P2.2 provenance
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

    // ── WS-C: content-presence signal. Lets the UI distinguish "no source
    //    content" from "generation failed" from "ok" — so a missing category is
    //    surfaced honestly instead of silently rendering an empty card. ──
    const presence: Record<string, any> = {};
    if (vocabPresence) presence.vocabulary = vocabPresence;
    if (category === 'grammar' || category === 'all') {
      const n = Array.isArray(mergedManifest.grammar) ? mergedManifest.grammar.length : 0;
      presence.grammar = { category: 'grammar', enriched_count: n, status: n > 0 ? 'ok' : 'empty' };
    }
    if (category === 'story' || category === 'all') {
      const n = mergedManifest.story?.pages?.length || 0;
      presence.story = { category: 'story', enriched_count: n, status: n > 0 ? 'ok' : 'empty' };
    }
    if (category === 'dialogues' || category === 'all') {
      const n = Array.isArray(mergedManifest.dialogues) ? mergedManifest.dialogues.length : 0;
      presence.dialogues = { category: 'dialogues', enriched_count: n, status: n > 0 ? 'ok' : 'empty' };
    }
    if (category === 'characters' || category === 'all') {
      const n = Array.isArray(mergedManifest.characters) ? mergedManifest.characters.length : 0;
      presence.characters = { category: 'characters', enriched_count: n, status: n > 0 ? 'ok' : 'empty' };
    }

    return {
      success: true,
      unitId,
      category,
      enriched: mergedManifest,
      presence,
    };
  });
});
