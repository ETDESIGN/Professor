import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PROMPTS } from '../_shared/prompts/index.ts';
import { stripReasoning, extractJsonObject } from '../_shared/json.ts';
import { validateAndNormalizeFlow } from '../_shared/flowTypes.ts';
import { normalizeManifest, CanonicalManifest } from '../_shared/manifest.ts';

interface VocabItem {
  word: string;
  definition?: string;
  example_sentence?: string;
  context_sentence?: string;
  distractors?: string[];
  image_url?: string;
}

interface GrammarRule {
  rule: string;
  explanation?: string;
  examples?: string[];
  world_examples?: string[];
}

// Field accessors that tolerate the multiple key spellings produced across the
// pipeline (enrich-unit vs generate-lesson vs the legacy interface).
const exampleSentenceOf = (v: VocabItem): string => v.example_sentence || v.context_sentence || '';
const grammarExamplesOf = (g: GrammarRule): string[] => g.examples || g.world_examples || [];

// YouTube Data API is region-blocked, so we surface a search URL the teacher
// can open to play the recommended song/video (no embed/API required).
const youtubeSearchUrl = (q: string): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(q || '')}`;

function transformManifestToFlow(assets: any): any[] {
  const flow: any[] = [];
  const vocab: VocabItem[] = assets?.vocabulary || [];
  const grammar: GrammarRule[] = assets?.grammar || [];
  const chars = assets?.characters || [];
  const story = assets?.story?.pages || [];
  const title = assets?.title || 'Lesson';
  const topic = assets?.topic || '';

  const getImg = (v: VocabItem) =>
    v.image_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word || 'vocab')}`;

  flow.push({
    type: 'INTRO_SPLASH',
    data: { title, subtitle: topic, description: assets?.description || '' },
  });

  // Phase 4 (P2-6): lead with a warm-up MEDIA_PLAYER built from the first
  // song/video suggestion so the board has real media to present (with an
  // "open on YouTube" link) instead of a dead "no media" state.
  const mediaSuggestions = [
    ...(Array.isArray(assets?.song_suggestions) ? assets.song_suggestions : []),
    ...(Array.isArray(assets?.video_suggestions) ? assets.video_suggestions : []),
  ];
  if (mediaSuggestions.length > 0) {
    const m = mediaSuggestions[0];
    const sq = m?.search_query || m?.title || topic;
    flow.push({
      type: 'MEDIA_PLAYER',
      data: {
        title: m?.title || 'Warm-up Media',
        kind: assets?.song_suggestions?.includes(m) ? 'song' : 'video',
        search_query: sq,
        topic_relevance: m?.topic_relevance || '',
        youtubeUrl: youtubeSearchUrl(sq),
        lyrics: [],
      },
    });
  }

  if (vocab.length > 0) {
    flow.push({
      type: 'FOCUS_CARDS',
      data: {
        title: `${title} — Vocabulary`,
        cards: vocab.map((v) => ({
          front: v.word,
          back: v.definition || '',
          context_sentence: exampleSentenceOf(v),
          phonetic: (v as any)?.phonetic,
          image: getImg(v),
        })),
      },
    });

    flow.push({
      type: 'LISTEN_TAP',
      data: {
        instruction: `Listen and tap the correct word`,
        targetWord: vocab[0].word,
        options: vocab.slice(0, 4).map((v, i) => ({
          id: i,
          img: getImg(v),
          label: v.word,
          correct: i === 0,
        })).sort(() => Math.random() - 0.5),
      },
    });

    flow.push({
      type: 'TEAM_BATTLE',
      data: {
        topic,
        questions: vocab.slice(0, 8).map((v, i) => ({
          id: `q${i}`,
          text: `What does "${v.word}" mean?`,
          image: getImg(v),
          options: [
            v.definition || '',
            ...(v.distractors || []).slice(0, 3),
          ].slice(0, 4).sort(() => Math.random() - 0.5),
          correct: v.definition || '',
        })),
      },
    });

    if (vocab.length >= 2) {
      flow.push({
        type: 'FLASH_MATCH',
        data: {
          pairs: vocab.slice(0, 5).map((v, i) => ({
            id: `p_${i}`,
            left: v.word,
            right: v.definition || `${v.word} def`,
          })),
        },
      });
    }

    flow.push({
      type: 'SPEAKING',
      data: {
        targetSentence: exampleSentenceOf(vocab[0]) || vocab[0].word,
        targetWord: vocab[0].word,
      },
    });

    const target = vocab[0];
    const sentence = exampleSentenceOf(target) || `The ${target.word} is here`;
    const words = sentence.split(/\s+/).filter((w: string) => w.length > 0);
    const wordBank = words
      .map((w, i) => ({ id: `w_${i}`, text: w }))
      .concat(vocab.slice(1, 3).map((v, i) => ({ id: `d_${i}`, text: v.word.toLowerCase() })))
      .sort(() => Math.random() - 0.5);

    flow.push({
      type: 'SCRAMBLE',
      data: {
        targetSentence: { en: sentence, translation: target.definition || '' },
        wordBank,
      },
    });
  }

  if (grammar.length > 0) {
    const g = grammar[0];
    flow.push({
      type: 'GRAMMAR_SANDBOX',
      data: {
        title: g.rule,
        explanation: g.explanation || '',
        examples: grammarExamplesOf(g),
      },
    });

    // Grammar PRACTICE strand (audit G2): a pool-driven step consuming the
    // ERROR_SPOT / TRANSFORM items generated for this unit. Presentation (above)
    // + controlled practice, not presentation-only.
    flow.push({
      type: 'GRAMMAR_PRACTICE',
      data: { title: `${g.rule} — Practice`, poolDriven: true },
    });
  }

  if (story.length > 0) {
    flow.push({
      type: 'STORY_STAGE',
      data: {
        title: `${title} — Story`,
        pages: story.map((p: any) => {
          // enrich-unit emits `speaker`; older paths used `character_name`.
          const speakerName = p.speaker || p.character_name || chars[0]?.name || 'Narrator';
          const matched = chars.find((c: any) => c.name === speakerName);
          return {
            text: p.text,
            speaker: speakerName,
            avatar: matched?.emoji || chars[0]?.emoji || '👤',
          };
        }),
      },
    });
  }

  // Phase tagging (plan Phase 1.5): every step carries its pedagogical phase so
  // the board timeline + student phase bar know the step's role. PRACTICE/
  // ASSESS blocks are pool-driven (the runtime pulls pool_items by mastery/SRS
  // instead of the frozen block data); their data stays as a fallback.
  const PHASE_FOR_TYPE: Record<string, string> = {
    INTRO_SPLASH: 'WARMUP',
    MEDIA_PLAYER: 'WARMUP',
    LIVE_WARMUP: 'WARMUP',
    FOCUS_CARDS: 'INPUT',
    GRAMMAR_SANDBOX: 'INPUT',
    GRAMMAR_PRACTICE: 'PRACTICE',
    STORY_STAGE: 'OUTPUT',
    LISTEN_TAP: 'PRACTICE',
    FLASH_MATCH: 'PRACTICE',
    SCRAMBLE: 'PRACTICE',
    SPEAKING: 'PRACTICE',
    TEAM_BATTLE: 'ASSESS',
    SPEED_QUIZ: 'ASSESS',
    MAGIC_EYES: 'PRACTICE',
    WHATS_MISSING: 'PRACTICE',
    STORY_SEQUENCING: 'PRACTICE',
    I_SAY_YOU_SAY: 'PRACTICE',
    UNSCRAMBLE: 'PRACTICE',
    WHEEL_OF_DESTINY: 'ASSESS',
    POLL: 'WRAPUP',
    GAME_ARENA: 'WRAPUP',
    UNIT_SELECTION: 'WRAPUP',
  };
  const POOL_DRIVEN_TYPES = new Set([
    'LISTEN_TAP', 'FLASH_MATCH', 'SCRAMBLE', 'SPEAKING', 'TEAM_BATTLE',
    'SPEED_QUIZ', 'MAGIC_EYES', 'WHATS_MISSING', 'STORY_SEQUENCING',
    'I_SAY_YOU_SAY', 'UNSCRAMBLE', 'WHEEL_OF_DESTINY',
  ]);
  for (const block of flow) {
    if (PHASE_FOR_TYPE[block.type]) block.phase = PHASE_FOR_TYPE[block.type];
    if (POOL_DRIVEN_TYPES.has(block.type)) block.data = { ...(block.data || {}), poolDriven: true };
  }

  return flow;
}

// Shape the canonical manifest into the flat "assets" view that
// transformManifestToFlow and the AI prompt consume.
function toFlowAssets(c: CanonicalManifest, fallbackTitle?: string): any {
  return {
    title: c.meta.unit_title || fallbackTitle || 'Lesson',
    topic: c.meta.theme,
    description: c.meta.description,
    vocabulary: c.vocabulary,
    grammar: c.grammar,
    characters: c.characters,
    story: c.story,
    song_suggestions: c.song_suggestions,
    video_suggestions: c.video_suggestions,
    dialogues: c.dialogues,
  };
}

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'orchestrate-lesson',
    requireAuth: true,
    rateLimit: { maxRequests: 10, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'unitId', required: true, type: 'string' },
      { field: 'approvedAssets', required: true, type: 'object' },
    ],
  }, async (body, auth) => {
    const { unitId, approvedAssets } = body;
    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
    const aiApiKey = Deno.env.get('AI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!auth?.userId) {
      return { success: false, error: 'Authentication required' };
    }

    // Phase 2: normalize the approvedAssets payload into one canonical flat
    // shape (tolerant of knowledge_graph / enriched_content / flat). Falls back
    // to the unit's stored manifest below if approvedAssets has no vocabulary.
    let canonical = normalizeManifest(approvedAssets);
    let assetsForFlow = toFlowAssets(canonical);

    let rawFlow: any[] = [];
    let aiSource = 'fallback';

    if (supabaseUrl && supabaseKey) {
      const sbClient = createClient(supabaseUrl, supabaseKey);
      const { data: unit, error: unitError } = await sbClient
        .from('units')
        .select('teacher_id, title, manifest')
        .eq('id', unitId)
        .single();

      if (unitError || !unit) {
        return { success: false, error: 'Unit not found' };
      }

      if (unit.teacher_id && unit.teacher_id !== auth.userId) {
        return { success: false, error: 'You do not own this unit' };
      }

      // Fall back to the stored manifest if the client payload was empty.
      if (canonical.vocabulary.length === 0 && unit.manifest) {
        canonical = normalizeManifest(unit.manifest);
        assetsForFlow = toFlowAssets(canonical, unit.title);
      }

      if (aiApiKey) {
        const prompt = PROMPTS.orchestration;
        const userPrompt = prompt.userPromptTemplate
          .replace('{{unitId}}', unitId)
          .replace('{{approvedAssets}}', JSON.stringify(assetsForFlow));

        try {
          let aiResponse: Response | null = null;
          const models = [
            Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-k2.6',
            Deno.env.get('FALLBACK_MODEL_NAME') || 'qwen/qwen3-235b-a22b',
          ];

          for (const modelName of models) {
            try {
              const resp = await fetch(`${aiBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
                // Bounded timeout: never let a slow/hung model hang the
                // invocation past Supabase's wall-clock limit (the prior cause
                // of status 546). On timeout we fall back to the next model or
                // to the deterministic transformer.
                signal: AbortSignal.timeout(30000),
                body: JSON.stringify({
                  model: modelName,
                  messages: [
                    { role: 'system', content: prompt.systemPrompt },
                    { role: 'user', content: userPrompt },
                  ],
                  temperature: 0.4,
                  // A flow JSON is a few KB; 25000 tokens made the model reason
                  // far too long. 6000 is plenty and returns much faster.
                  max_tokens: 6000,
                }),
              });
              if (resp.ok) { aiResponse = resp; break; }
            } catch { /* try next model (incl. timeout) */ }
          }

          if (aiResponse) {
            const aiData = await aiResponse.json();

            if (aiData.usage) {
              await sbClient.from('llm_telemetry').insert({
                unit_id: unitId,
                function_name: 'orchestrate-lesson',
                model_used: aiData.model || Deno.env.get('AI_MODEL_NAME') || 'unknown',
                prompt_tokens: aiData.usage.prompt_tokens || 0,
                completion_tokens: aiData.usage.completion_tokens || 0,
                total_tokens: aiData.usage.total_tokens || 0,
              });
            }

            const cleaned = stripReasoning(aiData.choices?.[0]?.message?.content || '');

            let generatedData: any;
            try {
              generatedData = JSON.parse(cleaned);
            } catch {
              // Self-healing JSON DAG: ask the fallback model to repair.
              try {
                const healerResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
                  signal: AbortSignal.timeout(25000),
                  body: JSON.stringify({
                    model: Deno.env.get('FALLBACK_MODEL_NAME') || 'qwen/qwen3-235b-a22b',
                    messages: [
                      { role: 'system', content: 'You are a JSON parser repair agent. Return ONLY the fully corrected, strictly valid JSON representation. Do NOT emit markdown backticks.' },
                      { role: 'user', content: `Repair this broken JSON:\n${cleaned}` },
                    ],
                    temperature: 0.1,
                  }),
                });
                if (healerResponse.ok) {
                  const healerData = await healerResponse.json();
                  const healed = stripReasoning(healerData.choices?.[0]?.message?.content || '');
                  generatedData = JSON.parse(extractJsonObject(healed));
                } else {
                  throw new Error('Self-healing JSON DAG failed.');
                }
              } catch {
                throw new Error('Self-healing JSON DAG failed.');
              }
            }

            if (Array.isArray(generatedData.flow)) {
              rawFlow = generatedData.flow;
              aiSource = 'ai-flow';
            } else if (Array.isArray(generatedData.timeline)) {
              rawFlow = generatedData.timeline;
              aiSource = 'ai-timeline';
            }
          }
        } catch {
          /* fall through to deterministic transformer */
        }
      }
    }

    const fallbackTitle = assetsForFlow.title || 'Lesson';
    const errors: string[] = [];
    let flow: any[];
    let dropped = 0;

    try {
      if (rawFlow.length === 0) {
        rawFlow = transformManifestToFlow(assetsForFlow);
        aiSource = rawFlow.length > 1 ? 'transformer' : 'empty';
      }

      // Validate + normalise before persisting so units.flow always conforms to
      // the Board's data contract (supported types, intro at index 0, data obj).
      const normalized = validateAndNormalizeFlow(rawFlow, fallbackTitle);
      flow = normalized.flow;
      dropped = normalized.dropped;
    } catch (flowErr: any) {
      // Defense-in-depth: flow generation must NEVER crash the invocation
      // (a throw here would surface as a 546). Fall back to a minimal valid
      // flow so the unit still publishes and the error is reported, not fatal.
      flow = [{ type: 'INTRO_SPLASH', data: { title: fallbackTitle, subtitle: '', description: '' } }];
      errors.push(`flow generation failed: ${flowErr?.message || String(flowErr)}`);
      aiSource = 'minimal-fallback';
    }

    if (supabaseUrl && supabaseKey) {
      try {
        const sbClient = createClient(supabaseUrl, supabaseKey);

        const { error: updateError } = await sbClient
          .from('units')
          .update({ flow, status: 'Active' })
          .eq('id', unitId);

        if (updateError) {
          errors.push(`units update failed: ${updateError.message}`);
        }

        const vocab = canonical.vocabulary;
        if (vocab.length > 0) {
          const srsRows = vocab.map((v: any) => ({
            word: v.word,
            translation: v.definition || '',
            unit_id: unitId,
            student_id: null,
          }));

          // Clear previous templates for this unit, then batch-insert fresh ones.
          try {
            await sbClient
              .from('srs_items')
              .delete()
              .is('student_id', null)
              .eq('unit_id', unitId);

            const { error: srsError } = await sbClient.from('srs_items').insert(srsRows);
            if (srsError) {
              errors.push(`srs_items batch insert failed: ${srsError.message}`);
            }
          } catch (srsErr: any) {
            errors.push(`srs_items persistence failed: ${srsErr?.message || String(srsErr)}`);
          }
        }
      } catch (err: any) {
        errors.push(`persistence error: ${err?.message || String(err)}`);
      }

      // Trigger the exercise-pool generation (plan Phase 1.5). Runs AFTER flow +
      // srs templates are written so it has the full sibling pool. Fire-and-
      // forget (NOT awaited): generate-exercises does per-word image generation
      // which can run long; awaiting it would consume THIS function's wall-clock
      // budget and 546-kill the publish (defeating the "non-fatal" intent). The
      // pool is regenerated on demand if this detached call is cut short.
      try {
        const authHeader = req.headers.get('authorization');
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-exercises`;
        // Detach: resolve the promise but don't block the response on it.
        fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify({ unitId }),
        }).catch((e) => console.error('generate-exercises detached trigger failed:', e?.message || e));
      } catch (genErr: any) {
        console.error('generate-exercises trigger failed (non-fatal):', genErr?.message || genErr);
      }
    }

    return {
      success: errors.length === 0,
      unitId,
      flow,
      source: aiSource,
      droppedBlocks: dropped,
      ...(errors.length > 0 ? { errors } : {}),
    };
  });
});
