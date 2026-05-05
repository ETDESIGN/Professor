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

    let aiResponse;
    const makeAiRequest = async (modelName: string) => {
      return fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages,
          temperature: 0.1,
          max_tokens: 1000,
        }),
      });
    };

    try {
      aiResponse = await makeAiRequest(Deno.env.get('VISION_MODEL_NAME') || 'google/gemini-2.0-flash-exp:free');
      if (!aiResponse.ok) throw new Error('Primary Vision Model Failed');
    } catch {
      aiResponse = await makeAiRequest(Deno.env.get('FALLBACK_VISION_MODEL_NAME') || 'openai/gpt-4o-mini');
    }

    if (!aiResponse.ok) {
      throw new Error(`Vision AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

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
