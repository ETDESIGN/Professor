import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { PROMPTS } from '../_shared/prompts/index.ts';

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'extract-page',
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
      Deno.env.get('VISION_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free',
      Deno.env.get('FALLBACK_VISION_MODEL_NAME') || 'qwen/qwen2.5-vl-72b-instruct:free',
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
        const content = data.choices?.[0]?.message?.content || '';
        if (content.toLowerCase().includes('does not support image') || content.toLowerCase().includes('cannot read')) {
          lastError = `Model ${modelName} does not support image input`;
          continue;
        }
        aiResponse = resp;
        aiContent = content;
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
      return {
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
    } catch {
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
