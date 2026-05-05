import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PROMPTS } from '../_shared/prompts/index.ts';

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'generate-lesson',
    rateLimit: { maxRequests: 10, windowMs: 60 * 1000 },
    validationRules: [
      {
        custom: (_value: any, body: any) => {
          if (body.action === 'differentiate') {
            if (!body.text) return 'Missing required field for differentiate: text';
            return null;
          }
          if (body.action === 'live-feedback') return null;
          if (!body.topic) return 'Missing required field: topic';
          if (!body.gradeLevel) return 'Missing required field: gradeLevel';
          return null;
        },
      },
    ],
  }, async (body, _auth) => {
    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
    const aiApiKey = Deno.env.get('AI_API_KEY');
    const { topic, gradeLevel, documentContext, imageBase64, action, text, theme } = body;

    if (action === 'differentiate' && text && theme) {
      if (!aiApiKey) {
        return { below: text, on: text, above: text };
      }
      const prompt = PROMPTS.differentiation;
      const userPrompt = prompt.userPromptTemplate
        .replace('{{text}}', text)
        .replace('{{theme}}', theme);

      let aiResponse: Response | null = null;
      const models = [
        Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free',
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
              temperature: 0.3,
            }),
          });
          if (resp.ok) { aiResponse = resp; break; }
        } catch { /* try next model */ }
      }

      if (aiResponse) {
        const aiData = await aiResponse.json();

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        if (aiData.usage && supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey);
          await supabase.from('llm_telemetry').insert({
            function_name: 'generate-lesson-diff',
            model_used: aiData.model || Deno.env.get('AI_MODEL_NAME') || 'unknown',
            prompt_tokens: aiData.usage.prompt_tokens || 0,
            completion_tokens: aiData.usage.completion_tokens || 0,
            total_tokens: aiData.usage.total_tokens || 0
          });
        }

        let content = aiData.choices?.[0]?.message?.content || '{}';
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();

        let validatedJson;
        try {
          validatedJson = JSON.parse(content);
        } catch (error) {
          const healerResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: Deno.env.get('FALLBACK_MODEL_NAME') || 'google/gemini-2.0-flash-exp:free',
              messages: [
                { role: 'system', content: 'You are a JSON parser repair agent. Return ONLY fully corrected, strictly valid JSON representation. Do NOT emit markdown backticks.' },
                { role: 'user', content: `Repair this broken JSON:\n${content}` }
              ],
              temperature: 0.1
            })
          });

          if (healerResponse.ok) {
            const healerData = await healerResponse.json();
            const healedContent = (healerData.choices[0]?.message?.content || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
            validatedJson = JSON.parse(healedContent);
          } else {
            throw new Error("Self-healing JSON DAG failed for differentiation.");
          }
        }
        return validatedJson;
      } else {
        return { below: text, on: text, above: text }; // Fallback string if primary fails entirely
      }
    }

    if (action === 'live-feedback') {
      return { suggestion: 'Consider reviewing the previous concept before moving forward.', context: body.context || '' };
    }

    if (!aiApiKey) {
      return {
        textContent: {
          title: `${topic} Lesson`,
          description: `A lesson about ${topic} for ${gradeLevel} students.`,
          visual_prompt: `Educational illustration about ${topic}`,
          spoken_intro: `Welcome to today's lesson about ${topic}!`,
          vocabulary: [
            { word: topic, definition: `The main topic of this lesson`, image_prompt: `Illustration of ${topic}` },
          ],
          grammarRules: [{ rule: 'Basic Sentence Structure', explanation: 'Subject + Verb + Object' }],
          sentences: [
            { original: `We are learning about ${topic}.`, translation: `We are studying ${topic}.` },
          ],
        },
        imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(topic)}`,
        audioUrl: null,
      };
    }

    const lessonPrompt = PROMPTS.lessonGeneration;
    const safeDocumentContext = documentContext ? String(documentContext).slice(0, 15000) : 'No additional context provided.';

    const lessonUserPrompt = lessonPrompt.userPromptTemplate
      .replace('{{topic}}', topic || '')
      .replace('{{gradeLevel}}', gradeLevel || '')
      .replace('{{documentContext}}', safeDocumentContext);

    const messages: any[] = [
      { role: 'system', content: lessonPrompt.systemPrompt },
      { role: 'user', content: lessonUserPrompt },
    ];

    if (imageBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Also use this image as reference material for the lesson.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      });
    }

    let lessonAiResponse: Response | null = null;
    const lessonModels = [
      Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free',
      Deno.env.get('FALLBACK_MODEL_NAME') || 'google/gemini-2.0-flash-exp:free',
    ];

    for (const modelName of lessonModels) {
      try {
        const resp = await fetch(`${aiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName, messages, temperature: 0.7, max_tokens: 2000 }),
        });
        if (resp.ok) { lessonAiResponse = resp; break; }
      } catch { /* try next model */ }
    }

    if (!lessonAiResponse) {
      return {
        textContent: {
          title: `${topic} Lesson`,
          description: `A lesson about ${topic} for ${gradeLevel} students.`,
          visual_prompt: `Educational illustration about ${topic}`,
          spoken_intro: `Welcome to today's lesson about ${topic}!`,
          vocabulary: [
            { word: topic, definition: `The main topic of this lesson`, image_prompt: `Illustration of ${topic}` },
          ],
          grammarRules: [{ rule: 'Basic Sentence Structure', explanation: 'Subject + Verb + Object' }],
          sentences: [
            { original: `We are learning about ${topic}.`, translation: `We are studying ${topic}.` },
          ],
        },
        imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(topic)}`,
        audioUrl: null,
      };
    }

    const aiData = await lessonAiResponse.json();

    // Telemetry Capture
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (aiData.usage && supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from('llm_telemetry').insert({
        function_name: 'generate-lesson-core',
        model_used: aiData.model || Deno.env.get('AI_MODEL_NAME') || 'unknown',
        prompt_tokens: aiData.usage.prompt_tokens || 0,
        completion_tokens: aiData.usage.completion_tokens || 0,
        total_tokens: aiData.usage.total_tokens || 0
      });
    }

    let content = aiData.choices?.[0]?.message?.content || '{}';
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let finalJson;
    try {
      finalJson = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
    } catch (e) {
      // Agentic Healer DAG
      const healerResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: Deno.env.get('FALLBACK_MODEL_NAME') || 'google/gemini-2.0-flash-exp:free',
          messages: [
            { role: 'system', content: 'You are a JSON parser repair agent. Return ONLY fully corrected, strictly valid JSON representation.' },
            { role: 'user', content: `Repair this broken JSON:\n${content}` }
          ],
          temperature: 0.1
        })
      });

      if (healerResponse.ok) {
        const healerData = await healerResponse.json();
        const healedContent = (healerData.choices[0]?.message?.content || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
        finalJson = JSON.parse(healedContent.match(/\{[\s\S]*\}/)?.[0] || '{}');
      } else {
        throw new Error("Self-healing JSON DAG failed for core generation.");
      }
    }

    return {
      textContent: finalJson,
      imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(topic)}`,
      audioUrl: null,
    };
  });
});
