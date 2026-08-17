import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PROMPTS } from '../_shared/prompts/index.ts';
import { stripReasoning, extractJsonObject } from '../_shared/json.ts';
import { validateAndNormalizeFlow } from '../_shared/flowTypes.ts';
import { normalizeManifest, CanonicalManifest } from '../_shared/manifest.ts';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';

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
  // `let` (not `const`): the function reassigns `flow` at the pedagogical-
  // ordering step (flow = flow.map(...).sort(...)). A prior `const flow`
  // declaration threw "Assignment to constant variable" there, which was
  // caught by the orchestrator's try/catch and silently fell back to a
  // 1-block minimal flow on EVERY unit — so every unit had flow_len=1.
  let flow: any[] = [];
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

    // New-gen listening strand (NEWGEN_AUDIT §3.10): SOUND_LAB replaces the
    // frozen-data LISTEN_TAP slot — pool-driven (recognize → discriminate →
    // produce phases) instead of a single vocab[0]-anchored frozen block.
    flow.push({
      type: 'SOUND_LAB',
      data: { title: `${title} — Sound Lab` },
    });

    flow.push({
      type: 'MEMORY_LAB',
      data: { title: `${title} — Memory Lab` },
    });

    // Assessment rotates Team Battle (teams, frozen fallback data) with the
    // new-gen Vocab Blitz (timed MCQ, reveal-on-miss) by unit — opposite parity
    // to the recognition rotation so a unit mixes legacy + new-gen, and
    // consecutive units differ (NEWGEN_AUDIT §3.10).
    if (title.length % 2 === 0) {
      flow.push({
        type: 'VOCAB_BLITZ',
        data: { title: `${title} — Vocab Blitz` },
      });
    } else {
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
    }

    // Vocabulary-recognition practice rotates between the v2 FlashMatch and the
    // new-gen Word Detective by unit (title parity) so consecutive units don't
    // replay the same game (NEWGEN_AUDIT §3.10 — variety across lessons).
    if (vocab.length >= 2) {
      const recognitionIsNewGen = title.length % 2 === 0;
      if (recognitionIsNewGen) {
        flow.push({
          type: 'WORD_DETECTIVE',
          data: { title: `${title} — Word Detective` },
        });
      } else {
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
    }

    flow.push({
      type: 'SPEAKING',
      data: {
        targetSentence: exampleSentenceOf(vocab[0]) || vocab[0].word,
        targetWord: vocab[0].word,
      },
    });

    // New-gen sentence construction (NEWGEN_AUDIT §3.10): SENTENCE_LAB replaces
    // the frozen-data SCRAMBLE slot — pool-driven tile building with distractors
    // and LCS feedback instead of a single vocab[0]-anchored frozen sentence.
    flow.push({
      type: 'SENTENCE_LAB',
      data: { title: `${title} — Sentence Lab` },
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

    // Grammar PRACTICE strand: GRAMMAR_LAB (new-gen, NEWGEN_AUDIT §3.10)
    // replaces the legacy GRAMMAR_PRACTICE slot — pool-driven 3-rung ladder
    // (error spot → transform → fill-blank) instead of teacher-led error-spot.
    flow.push({
      type: 'GRAMMAR_LAB',
      data: { title: `${g.rule} — Grammar Lab` },
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

    // New-gen story comprehension (NEWGEN_AUDIT §3.10): STORY_QUEST follows the
    // read-through — prediction gates + pool-driven comprehension MCQs.
    flow.push({
      type: 'STORY_QUEST',
      data: { title: `${title} — Story Quest` },
    });
  }

  // Phase 1.3/2: dialogue role-play stage. enrich-unit writes dialogues to the
  // manifest (and relationally to dialogue_lines); surface them as a presentable
  // DIALOGUE_STAGE step WITH real lines (previously dialogue never reached the
  // flow, and composer-added dialogue steps shipped empty data -> blank board).
  const dialogues = Array.isArray(assets?.dialogues) ? assets.dialogues : [];
  const dialogueLines = dialogues.flatMap((d: any) => (Array.isArray(d?.lines) ? d.lines : []));
  if (dialogueLines.length > 0) {
    flow.push({
      type: 'DIALOGUE_STAGE',
      data: {
        title: dialogues[0]?.title || `${title} — Dialogue`,
        lines: dialogueLines.map((l: any) => ({ speaker: l.speaker, text: l.text, translation: l.translation })),
      },
    });
  }

  // New-gen cooperative closer (NEWGEN_AUDIT §3.10): CLASS_RALLY ends the
  // lesson with the shared progress bar — every picked answer fills it and the
  // milestone confetti is addressed to the whole class.
  if (vocab.length > 0) {
    flow.push({
      type: 'CLASS_RALLY',
      data: { title: `${title} — Class Rally` },
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
    DIALOGUE_STAGE: 'OUTPUT',
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
    // ── New-gen games (MASTER_ROADMAP.md, 2026-08-07) ──────────────────────
    GRAMMAR_LAB: 'PRACTICE',
    WORD_DETECTIVE: 'PRACTICE',
    SOUND_LAB: 'PRACTICE',
    STORY_QUEST: 'PRACTICE',
    SENTENCE_LAB: 'PRACTICE',
    PHONICS_ARENA: 'PRACTICE',
    VOCAB_BLITZ: 'ASSESS',
    MEMORY_LAB: 'PRACTICE',
    CLASS_RALLY: 'PRACTICE',
    FAST_VOCAB: 'PRACTICE',
  };
  const POOL_DRIVEN_TYPES = new Set([
    'LISTEN_TAP', 'FLASH_MATCH', 'SCRAMBLE', 'SPEAKING', 'TEAM_BATTLE',
    'SPEED_QUIZ', 'MAGIC_EYES', 'WHATS_MISSING', 'STORY_SEQUENCING',
    'I_SAY_YOU_SAY', 'UNSCRAMBLE', 'WHEEL_OF_DESTINY',
    // New-gen shells all pull pool_items at runtime (STORY_QUEST pulls its
    // comprehension MCQs from the pool even though the panels come from the
    // manifest).
    'GRAMMAR_LAB', 'WORD_DETECTIVE', 'SOUND_LAB', 'STORY_QUEST',
    'SENTENCE_LAB', 'PHONICS_ARENA', 'VOCAB_BLITZ', 'MEMORY_LAB', 'CLASS_RALLY',
    'FAST_VOCAB',
  ]);
  for (const block of flow) {
    if (PHASE_FOR_TYPE[block.type]) block.phase = PHASE_FOR_TYPE[block.type];
    if (POOL_DRIVEN_TYPES.has(block.type)) block.data = { ...(block.data || {}), poolDriven: true };
  }

  // F4: Pedagogical ordering — sort the flow into the teaching arc
  // (warm-up → input → output → practice → assess → wrap) using the phase tags.
  // Stable (preserves the original push order within each phase group).
  const PHASE_ORDER: Record<string, number> = {
    WARMUP: 0, INPUT: 1, OUTPUT: 2, PRACTICE: 3, ASSESS: 4, WRAPUP: 5, REVIEW: 6,
  };
  flow = flow
    .map((block, originalIndex) => ({ block, originalIndex }))
    .sort(
      (a, b) =>
        (PHASE_ORDER[a.block.phase] ?? 9) - (PHASE_ORDER[b.block.phase] ?? 9) ||
        a.originalIndex - b.originalIndex,
    )
    .map((x) => x.block);

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

      // Single ownership policy (Bug B1 fix): strict, shared via assertOwnership.
      const ownership = assertUnitOwnership(unit.teacher_id, { callerId: auth.userId, callerRole: auth.role });
      if (!ownership.ok) {
        return { success: false, error: ownership.reason };
      }

      // Fall back to the stored manifest if the client payload was empty.
      if (canonical.vocabulary.length === 0 && unit.manifest) {
        canonical = normalizeManifest(unit.manifest);
        assetsForFlow = toFlowAssets(canonical, unit.title);
      }

      // B-ORCH-DRIFT fix: the relational tables are the canonical source for
      // story/grammar/dialogue (advisor §2.4 — one read contract, manifest is
      // legacy). Previously orchestrate-lesson built flow blocks from the
      // manifest, so a teacher's edit to story_pages/dialogue_lines/grammar_rules
      // didn't reach the live board (while pool_items DID update) — the board and
      // the pool could show different content. Override the manifest-derived
      // arrays with the relational tables when populated (per-category fallback:
      // empty table → keep manifest). Best-effort, non-fatal.
      try {
        const [storyRes, grammarRes, dialogueRes] = await Promise.all([
          sbClient.from('story_pages').select('page_number,text,speaker,speaker_override_name,image_prompt').eq('unit_id', unitId).order('page_number', { ascending: true }),
          sbClient.from('grammar_rules').select('rule,explanation,examples').eq('unit_id', unitId).order('order_index', { ascending: true }),
          sbClient.from('dialogue_lines').select('order_index,speaker,speaker_override_name,text,translation').eq('unit_id', unitId).order('order_index', { ascending: true }),
        ]);
        if (storyRes.data && storyRes.data.length > 0) {
          assetsForFlow.story = { ...assetsForFlow.story, pages: storyRes.data.map((p: any) => ({ text: p.text, speaker: p.speaker || p.speaker_override_name, image_prompt: p.image_prompt })) };
        }
        if (grammarRes.data && grammarRes.data.length > 0) {
          assetsForFlow.grammar = grammarRes.data.map((g: any) => ({ rule: g.rule, explanation: g.explanation, examples: g.examples || [] }));
        }
        if (dialogueRes.data && dialogueRes.data.length > 0) {
          // dialogue_lines is flat; wrap as a single dialogue for the flow block.
          assetsForFlow.dialogues = [{ title: assetsForFlow?.dialogues?.[0]?.title || `${unit.title} — Dialogue`, lines: dialogueRes.data.map((l: any) => ({ speaker: l.speaker || l.speaker_override_name, text: l.text, translation: l.translation })) }];
        }
      } catch (relErr: any) {
        console.error('orchestrate-lesson relational override failed (non-fatal, manifest used):', relErr?.message || relErr);
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
      // Declare sbClient in the outer scope so the generation_jobs upsert
      // (which runs after the units/srs_items try/catch below) can reference it.
      // Previously it was `const` inside the try, so the upsert threw
      // "sbClient is not defined" — caught silently, which is why no
      // generation_jobs row ever appeared.
      const sbClient = createClient(supabaseUrl, supabaseKey);
      try {
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
      // budget and 546-kill the publish (defeating the "non-fatal" intent).
      //
      // B1b fix: the trigger is now RECORDED as a generation_jobs row so a silent
      // drop (cold start / missing auth header / function error) is visible and
      // retryable instead of `.catch(console.error)`-into-void. generate-exercises
      // flips the row to running/succeeded/failed on its end.
      const STAGE = 'generate-exercises';
      try {
        // Upsert the job row (unique(unit_id, stage) — re-publish resets it).
        // Surface the error in the response (not just console) so the missing-
        // row mystery is diagnosable without dashboard log access.
        const { error: jobUpsertError } = await sbClient.from('generation_jobs').upsert(
          { unit_id: unitId, stage: STAGE, status: 'pending', error: null, attempt: 1, started_at: null, completed_at: null },
          { onConflict: 'unit_id,stage' },
        );
        if (jobUpsertError) {
          errors.push(`generation_jobs upsert error: ${jobUpsertError.message}`);
        }
      } catch (jobErr: any) {
        // Non-fatal: the job table is observability, not a publish dependency.
        errors.push(`generation_jobs upsert threw: ${jobErr?.message || jobErr}`);
      }
      try {
        const authHeader = req.headers.get('authorization');
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-exercises`;
        // Detach: don't block the response on the fetch (generate-exercises
        // can run long on per-word image generation), but register it with
        // EdgeRuntime.waitUntil so the isolate stays alive until it settles —
        // an unprotected detached fetch is silently dropped on teardown,
        // which is exactly how the pool went missing for months (audit
        // 2026-08-17, root cause 2).
        const trigger = fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify({ unitId }),
        }).catch((e) => {
          // If the trigger itself never lands, record it on the job row so the
          // failure is discoverable (and re-runnable) rather than invisible.
          console.error('generate-exercises detached trigger failed:', e?.message || e);
          sbClient.from('generation_jobs').update({
            status: 'failed', error: `trigger failed: ${e?.message || e}`, completed_at: new Date().toISOString(),
          }).eq('unit_id', unitId).eq('stage', STAGE)
            .then(() => undefined, () => undefined);
        });
        // EdgeRuntime is a Supabase edge global; fall back to a no-op hold if
        // unavailable so the code also runs under plain Deno tests.
        if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
          (globalThis as any).EdgeRuntime.waitUntil(trigger);
        }
      } catch (genErr: any) {
        console.error('generate-exercises trigger failed (non-fatal):', genErr?.message || genErr);
        sbClient.from('generation_jobs').update({
          status: 'failed', error: `trigger threw: ${genErr?.message || genErr}`, completed_at: new Date().toISOString(),
        }).eq('unit_id', unitId).eq('stage', STAGE)
          .then(() => undefined, () => undefined);
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
