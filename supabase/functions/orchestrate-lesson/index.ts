import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { PROMPTS } from '../_shared/prompts/index.ts';

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'orchestrate-lesson',
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
    let timelineId = `timeline_${Date.now()}`;

    if (aiApiKey) {
      const prompt = PROMPTS.orchestration;
      const userPrompt = prompt.userPromptTemplate
        .replace('{{unitId}}', unitId)
        .replace('{{approvedAssets}}', JSON.stringify(approvedAssets));

      try {
        const aiResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free',
            messages: [
              { role: 'system', content: prompt.systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.4,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '';
          const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
          flow = parsed.timeline || parsed.flow || [];
          timelineId = parsed.timelineId || timelineId;
        }
      } catch { /* use default flow */ }
    }

    if (flow.length === 0) {
      const textContent = approvedAssets?.textContent || {};
      flow = [
        { type: 'INTRO_SPLASH', title: textContent.title || 'Lesson', duration: 5 },
        { type: 'FOCUS_CARDS', title: 'Vocabulary', duration: 300 },
        { type: 'TEAM_BATTLE', title: 'Quiz', duration: 600 },
      ];
    }

    if (supabaseUrl && supabaseKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/units?id=eq.${unitId}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ flow, status: 'Active' }),
        });
      } catch { /* non-critical */ }
    }

    return {
      success: true,
      unitId,
      publishedAssets: approvedAssets,
      timelineId,
    };
  });
});
