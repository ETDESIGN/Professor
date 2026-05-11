import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PROMPTS } from '../_shared/prompts/index.ts';

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'extract-page',
    requireAuth: true,
    rateLimit: { maxRequests: 15, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'imageBase64', required: false, type: 'string', minLength: 100 },
      { field: 'fileUrl', required: false, type: 'string', minLength: 10 },
      { field: 'imageUrl', required: false, type: 'string', minLength: 10 },
      {
        custom: (_value: any, body: any) => {
          if (!body.imageBase64 && !body.fileUrl && !body.imageUrl) {
            return 'One of imageBase64, fileUrl, or imageUrl is required';
          }
          return null;
        },
      },
    ],
  }, async (body, _auth) => {
    const { imageBase64, imageUrl, fileUrl } = body;
    const inputUrl = fileUrl || imageUrl || '';
    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
    const aiApiKey = Deno.env.get('AI_API_KEY');

    if (!aiApiKey) {
      return {
        success: true,
        url: inputUrl,
        metadata: {
          extractedText: 'Text extraction requires AI configuration.',
          pageCount: 1,
          language: 'en',
        },
      };
    }

    const prompt = PROMPTS.extraction;

    const messages: any[] = [
      { role: 'system', content: prompt.systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt.userPromptTemplate },
          {
            type: 'image_url',
            image_url: {
              url: inputUrl || `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    let aiResponse: Response | null = null;
    let aiContent = '';
    let lastError = '';
    const models = [
      Deno.env.get('VISION_MODEL_NAME') || 'qwen/qwen3.6-plus',
      Deno.env.get('FALLBACK_VISION_MODEL_NAME') || 'nvidia/nemotron-nano-12b-v2-vl:free',
      'google/gemini-2.5-flash-lite-preview-09-2025',
    ];

    for (const modelName of models) {
      try {
        const resp = await fetch(`${aiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelName, messages, temperature: 0.1, max_tokens: 1000 }),
        });
        if (!resp.ok) {
          const errBody = await resp.text().catch(() => '');
          lastError = `Model ${modelName} returned ${resp.status}: ${errBody.slice(0, 200)}`;
          continue;
        }
        const data = await resp.json();
        if (data.error) {
          lastError = `Model ${modelName} API error: ${JSON.stringify(data.error)}`;
          continue;
        }
        const content = data.choices?.[0]?.message?.content || '';
        if (content.toLowerCase().includes('does not support image') || content.toLowerCase().includes('cannot read')) {
          lastError = `Model ${modelName} does not support image input`;
          continue;
        }
        aiResponse = resp;
        aiContent = content;

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        if (data.usage && supabaseUrl && supabaseKey) {
          const sbClient = createClient(supabaseUrl, supabaseKey);
          await sbClient.from('llm_telemetry').insert({
            function_name: 'extract-page',
            model_used: data.model || modelName,
            prompt_tokens: data.usage.prompt_tokens || 0,
            completion_tokens: data.usage.completion_tokens || 0,
            total_tokens: data.usage.total_tokens || 0,
          });
        }

        break;
      } catch (err: any) {
        lastError = `Model ${modelName} fetch failed: ${err.message}`;
      }
    }

    if (!aiResponse) {
      return {
        success: true,
        url: inputUrl,
        metadata: {
          extractedText: `Text extraction unavailable (${lastError}). Please try again later.`,
          pageCount: 1,
          language: 'en',
          _debug: lastError,
        },
      };
    }

    const content = aiContent;

    try {
      const raw = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
      const result = {
        success: true,
        url: inputUrl,
        metadata: {
          extractedText: parsed.extractedText || parsed.text || content,
          pageCount: parsed.pageCount || 1,
          language: parsed.language || 'en',
          vocabulary: parsed.vocabulary || [],
          topic: parsed.topic || '',
          gradeLevel: parsed.gradeLevel || '',
        },
      };
      console.log('extract-page SUCCESS:', JSON.stringify({
        hasTopic: !!result.metadata.topic,
        vocabCount: result.metadata.vocabulary.length,
        textLength: result.metadata.extractedText.length,
        gradeLevel: result.metadata.gradeLevel,
      }));
      return result;
    } catch (parseErr: any) {
      console.log('extract-page JSON_PARSE_FAILED:', parseErr.message, 'raw content preview:', content.substring(0, 200));
      return {
        success: true,
        url: inputUrl,
        metadata: {
          extractedText: content,
          pageCount: 1,
          language: 'en',
        },
      };
    }
  });
});
