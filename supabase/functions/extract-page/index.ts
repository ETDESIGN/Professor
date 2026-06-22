import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PROMPTS } from '../_shared/prompts/index.ts';
import { stripReasoning, extractJsonObject } from '../_shared/json.ts';

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

    let aiContent = '';
    let lastError = '';
    let usedModel = '';

    // REGION-SAFE: No Google, OpenAI, or Anthropic (blocked in user's region)
    const models = [
      Deno.env.get('VISION_MODEL_NAME') || 'qwen/qwen-2.5-vl-72b-instruct',
      Deno.env.get('FALLBACK_VISION_MODEL_NAME') || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'moonshotai/kimi-k2.6',
    ];

    for (const modelName of models) {
      try {
        const resp = await fetch(`${aiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages,
            temperature: 0.1,
            max_tokens: 3000,
          }),
        });
        if (!resp.ok) {
          const errBody = await resp.text().catch(() => '');
          lastError = `Model ${modelName} returned ${resp.status}: ${errBody.slice(0, 200)}`;
          console.error(`extract-page: ${lastError}`);
          continue;
        }
        const data = await resp.json();
        if (data.error) {
          lastError = `Model ${modelName} API error: ${JSON.stringify(data.error)}`;
          console.error(`extract-page: ${lastError}`);
          continue;
        }
        const content = data.choices?.[0]?.message?.content || '';
        if (!content || content.toLowerCase().includes('does not support image') || content.toLowerCase().includes('cannot read')) {
          lastError = `Model ${modelName} does not support image input`;
          console.error(`extract-page: ${lastError}`);
          continue;
        }

        aiContent = content;
        usedModel = data.model || modelName;

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        if (data.usage && supabaseUrl && supabaseKey) {
          const sbClient = createClient(supabaseUrl, supabaseKey);
          await sbClient.from('llm_telemetry').insert({
            function_name: 'extract-page',
            model_used: usedModel,
            prompt_tokens: data.usage.prompt_tokens || 0,
            completion_tokens: data.usage.completion_tokens || 0,
            total_tokens: data.usage.total_tokens || 0,
          });
        }
        console.log(`extract-page: SUCCESS with ${usedModel}`);
        break;
      } catch (err: any) {
        lastError = `Model ${modelName} fetch failed: ${err.message}`;
        console.error(`extract-page: ${lastError}`);
      }
    }

    if (!aiContent) {
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

    // Strip markdown, thinking tags, and code fences (shared util)
    const content = stripReasoning(aiContent);

    try {
      const parsed = JSON.parse(extractJsonObject(content));
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
          unit_number: parsed.unit_number || '',
          learning_objectives: parsed.learning_objectives || [],
          visual_context: parsed.visual_context || '',
          exercises: parsed.exercises || [],
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
