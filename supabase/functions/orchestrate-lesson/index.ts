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

function transformManifestToFlow(manifest: any): any[] {
  const flow: any[] = [];
  const meta = manifest.meta || {};
  const theme = manifest.theme_context || {};
  const kg = manifest.knowledge_graph || {};
  const vocab: VocabItem[] = kg.vocabulary || [];
  const grammar: GrammarRule[] = kg.grammar_rules || [];

  flow.push({
    type: 'INTRO_SPLASH',
    data: {
      title: meta.unit_title || 'Lesson',
      subtitle: meta.theme || '',
      description: theme.world_description || '',
    },
  });

  if (vocab.length > 0) {
    flow.push({
      type: 'FOCUS_CARDS',
      data: {
        title: `${meta.unit_title || 'Lesson'} — Vocabulary`,
        cards: vocab.map((v) => ({
          front: v.word,
          back: v.definition || '',
          context_sentence: v.context_sentence || '',
          image: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word || 'vocab')}`,
        })),
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
        examples: g.world_examples || [],
      },
    });
  }

  if (vocab.length > 0) {
    flow.push({
      type: 'GAME_ARENA',
      data: {
        title: `${meta.unit_title || 'Lesson'} — Quiz`,
        questions: vocab.slice(0, 8).map((v, i) => ({
          id: `q${i}`,
          text: `What does "${v.word}" mean?`,
          options: [
            v.definition || '',
            ...(v.distractors || []).slice(0, 3),
          ].slice(0, 4),
          correct: v.definition || '',
        })),
      },
    });
  }

  if (theme.characters && theme.characters.length > 0) {
    flow.push({
      type: 'STORY_STAGE',
      data: {
        title: `${meta.unit_title || 'Lesson'} — Story`,
        pages: (theme.characters || []).map((ch: any, i: number) => ({
          text: `${ch.name} (${ch.role}): "${vocab[i]?.context_sentence || vocab[i]?.word || 'Hello!'}"`,
          speaker: ch.name,
          avatar: ch.emoji || '👤',
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

    let flow: any[] = [];
    let manifest: any = null;

    if (aiApiKey) {
      const prompt = PROMPTS.orchestration;
      const userPrompt = prompt.userPromptTemplate
        .replace('{{unitId}}', unitId)
        .replace('{{approvedAssets}}', JSON.stringify(approvedAssets));

      try {
        let aiResponse: Response | null = null;
        const models = [
          Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-k2.6',
          Deno.env.get('FALLBACK_MODEL_NAME') || 'google/gemini-2.0-flash-exp:free',
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
          content = content.replace(/```json/g, '').replace(/```/g, '').trim();

          let generatedData;
          try {
            generatedData = JSON.parse(content);
          } catch {
            const healerResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: Deno.env.get('FALLBACK_MODEL_NAME') || 'google/gemini-2.0-flash-exp:free',
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
          } else if (generatedData.knowledge_graph || generatedData.meta) {
            manifest = generatedData;
            flow = transformManifestToFlow(manifest);
          }
        }
      } catch { /* use default flow */ }
    }

    if (flow.length === 0) {
      const textContent = approvedAssets?.textContent || {};
      flow = [
        { type: 'INTRO_SPLASH', data: { title: textContent.title || 'Lesson', subtitle: '' } },
        { type: 'FOCUS_CARDS', data: { title: 'Vocabulary', cards: [] } },
        { type: 'GAME_ARENA', data: { title: 'Quiz', questions: [] } },
      ];
    }

    const errors: string[] = [];

    if (supabaseUrl && supabaseKey) {
      try {
        const sbClient = createClient(supabaseUrl, supabaseKey);

        const updatePayload: any = { flow, status: 'Active' };
        if (manifest) updatePayload.manifest = manifest;

        const { error: updateError } = await sbClient
          .from('units')
          .update(updatePayload)
          .eq('id', unitId);

        if (updateError) {
          errors.push(`units update failed: ${updateError.message}`);
        }

        const vocab = manifest?.knowledge_graph?.vocabulary || [];
        if (vocab.length > 0 && auth?.userId) {
          for (const v of vocab) {
            try {
              await sbClient.from('srs_items').insert({
                word: v.word,
                translation: v.definition || '',
                unit_id: unitId,
                student_id: auth.userId,
              });
            } catch (srsErr: any) {
              errors.push(`srs_item insert failed for "${v.word}": ${srsErr?.message || String(srsErr)}`);
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
      manifest,
      timelineId: `timeline_${Date.now()}`,
      ...(errors.length > 0 ? { errors } : {}),
    };
  });
});
