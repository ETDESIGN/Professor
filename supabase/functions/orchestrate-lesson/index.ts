import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PROMPTS } from '../_shared/prompts/index.ts';

interface VocabItem {
  word: string;
  definition?: string;
  context_sentence?: string;
  distractors?: string[];
}

interface GrammarRule {
  rule: string;
  explanation?: string;
  world_examples?: string[];
}

function transformManifestToFlow(assets: any): any[] {
  const flow: any[] = [];
  const vocab = assets?.vocabulary || [];
  const grammar = assets?.grammar || [];
  const chars = assets?.characters || [];
  const story = assets?.story?.pages || [];
  const title = assets?.title || 'Lesson';
  const topic = assets?.topic || '';

  const getImg = (v: any) => v.image_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word || 'vocab')}`;

  flow.push({
    type: 'INTRO_SPLASH',
    data: { title, subtitle: topic, description: assets?.description || '' }
  });

  if (vocab.length > 0) {
    flow.push({
      type: 'FOCUS_CARDS',
      data: {
        title: `${title} — Vocabulary`,
        cards: vocab.map((v: any) => ({
          front: v.word,
          back: v.definition || '',
          context_sentence: v.example_sentence || '',
          image: getImg(v),
        })),
      },
    });

    flow.push({
      type: 'LISTEN_TAP',
      data: {
        instruction: `Listen and tap the correct word`,
        targetWord: vocab[0].word,
        options: vocab.slice(0, 4).map((v: any, i: number) => ({
          id: i,
          img: getImg(v),
          label: v.word,
          correct: i === 0
        })).sort(() => Math.random() - 0.5)
      }
    });

    flow.push({
      type: 'TEAM_BATTLE',
      data: {
        topic: topic,
        questions: vocab.slice(0, 8).map((v: any, i: number) => ({
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
          pairs: vocab.slice(0, 5).map((v: any, i: number) => ({
            id: `p_${i}`,
            left: v.word,
            right: v.definition || `${v.word} def`
          }))
        }
      });
    }

    flow.push({
      type: 'SPEAKING',
      data: {
        targetSentence: vocab[0].example_sentence || vocab[0].word,
        targetWord: vocab[0].word
      }
    });

    const target = vocab[0];
    const sentence = target.example_sentence || `The ${target.word} is here`;
    const words = sentence.split(/\\s+/).filter((w: string) => w.length > 0);
    const wordBank = words.map((w: string, i: number) => ({ id: `w_${i}`, text: w }))
      .concat(vocab.slice(1, 3).map((v: any, i: number) => ({ id: `d_${i}`, text: v.word.toLowerCase() })))
      .sort(() => Math.random() - 0.5);

    flow.push({
      type: 'SCRAMBLE',
      data: {
        targetSentence: { en: sentence, translation: target.definition || '' },
        wordBank
      }
    });
  }

  if (grammar.length > 0) {
    const g = grammar[0];
    flow.push({
      type: 'GRAMMAR_SANDBOX',
      data: {
        title: g.rule,
        explanation: g.explanation || '',
        examples: g.examples || [],
      },
    });
  }

  if (story.length > 0) {
    flow.push({
      type: 'STORY_STAGE',
      data: {
        title: `${title} — Story`,
        pages: story.map((p: any) => ({
          text: p.text,
          speaker: p.character_name || chars[0]?.name || 'Narrator',
          avatar: chars.find((c: any) => c.name === p.character_name)?.emoji || '👤',
        })),
      },
    });
  }

  return flow;
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

    let flow: any[] = [];

    if (supabaseUrl && supabaseKey) {
      const sbClient = createClient(supabaseUrl, supabaseKey);
      const { data: unit, error: unitError } = await sbClient
        .from('units')
        .select('teacher_id')
        .eq('id', unitId)
        .single();

      if (unitError || !unit) {
        return { success: false, error: 'Unit not found' };
      }

      if (unit.teacher_id && unit.teacher_id !== auth.userId) {
        return { success: false, error: 'You do not own this unit' };
      }
    }

    if (aiApiKey) {
      const prompt = PROMPTS.orchestration;
      const userPrompt = prompt.userPromptTemplate
        .replace('{{unitId}}', unitId)
        .replace('{{approvedAssets}}', JSON.stringify(approvedAssets));

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
              body: JSON.stringify({
                model: modelName,
                messages: [
                  { role: 'system', content: prompt.systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                temperature: 0.4,
                max_tokens: 25000,
              }),
            });
            if (resp.ok) { aiResponse = resp; break; }
          } catch { /* try next model */ }
        }

        if (aiResponse) {
          const aiData = await aiResponse.json();

          if (aiData.usage && supabaseUrl && supabaseKey) {
            const sbClient = createClient(supabaseUrl, supabaseKey);
            await sbClient.from('llm_telemetry').insert({
              unit_id: unitId,
              function_name: 'orchestrate-lesson',
              model_used: aiData.model || Deno.env.get('AI_MODEL_NAME') || 'unknown',
              prompt_tokens: aiData.usage.prompt_tokens || 0,
              completion_tokens: aiData.usage.completion_tokens || 0,
              total_tokens: aiData.usage.total_tokens || 0
            });
          }

          let content = aiData.choices?.[0]?.message?.content || '{}';
          content = content.replace(/<(think|reasoning)>[\s\S]*?(<\/(think|reasoning)>|$)/gi, '').trim();
          content = content.replace(/\|begin_thinking\|[\s\S]*?(\|end_thinking\||$)/gi, '').trim();
          content = content.replace(/```json/g, '').replace(/```/g, '').trim();

          let generatedData;
          try {
            generatedData = JSON.parse(content);
          } catch {
            const healerResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: Deno.env.get('FALLBACK_MODEL_NAME') || 'qwen/qwen3-235b-a22b',
                messages: [
                  { role: 'system', content: 'You are a JSON parser repair agent. Return ONLY the fully corrected, strictly valid JSON representation. Do NOT emit markdown backticks.' },
                  { role: 'user', content: `Repair this broken JSON:\n${content}` }
                ],
                temperature: 0.1
              })
            });
            if (healerResponse.ok) {
              const healerData = await healerResponse.json();
              const healedContent = (healerData.choices[0]?.message?.content || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
              generatedData = JSON.parse(healedContent.match(/\{[\s\S]*\}/)?.[0] || '{}');
            } else {
              throw new Error("Self-healing JSON DAG failed.");
            }
          }

          if (generatedData.flow && Array.isArray(generatedData.flow)) {
            flow = generatedData.flow;
          } else if (generatedData.timeline && Array.isArray(generatedData.timeline)) {
            flow = generatedData.timeline;
          } else {
            flow = transformManifestToFlow(approvedAssets);
          }
        }
      } catch { /* use default flow */ }
    }

    if (flow.length === 0) {
      flow = transformManifestToFlow(approvedAssets);
    }

    const errors: string[] = [];

    if (supabaseUrl && supabaseKey) {
      try {
        const sbClient = createClient(supabaseUrl, supabaseKey);

        const updatePayload: any = { flow, status: 'Active' };

        const { error: updateError } = await sbClient
          .from('units')
          .update(updatePayload)
          .eq('id', unitId);

        if (updateError) {
          errors.push(`units update failed: ${updateError.message}`);
        }

        const vocab = approvedAssets?.vocabulary || [];
        if (vocab.length > 0 && auth?.userId) {
          const srsRows = vocab.map((v: any) => ({
            word: v.word,
            translation: v.definition || '',
            unit_id: unitId,
            student_id: null,
          }));

          try {
            await sbClient
              .from('srs_items')
              .delete()
              .is('student_id', null)
              .eq('unit_id', unitId);
          } catch (delErr: any) {
            errors.push(`srs_item cleanup failed: ${delErr?.message || String(delErr)}`);
          }

          for (const row of srsRows) {
            try {
              await sbClient.from('srs_items').insert(row);
            } catch (srsErr: any) {
              errors.push(`srs_item insert failed for "${row.word}": ${srsErr?.message || String(srsErr)}`);
            }
          }
        } else if (vocab.length > 0 && !auth?.userId) {
          errors.push('srs_items skipped: no authenticated user');
        }
      } catch (err: any) {
        errors.push(`persistence error: ${err?.message || String(err)}`);
      }
    }

    return {
      success: errors.length === 0,
      unitId,
      flow,
      approvedAssets,
      timelineId: `timeline_${Date.now()}`,
      ...(errors.length > 0 ? { errors } : {}),
    };
  });
});
