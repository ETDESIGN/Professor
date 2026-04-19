import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { PROMPTS } from '../_shared/prompts/index.ts';

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'generate-lesson',
    rateLimit: { maxRequests: 10, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'topic', required: true, type: 'string', minLength: 1 },
      { field: 'gradeLevel', required: true, type: 'string', minLength: 1 },
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

      const aiResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free',
          messages: [
            { role: 'system', content: prompt.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || '';
        try {
          const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
          if (parsed.below && parsed.on && parsed.above) return parsed;
        } catch { /* fall through */ }
      }
      return { below: text, on: text, above: text };
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
            { word: 'Example', definition: 'A thing characteristic of its kind', image_prompt: 'An example illustration' },
            { word: 'Practice', definition: 'Repeated exercise to acquire skill', image_prompt: 'Practice illustration' },
          ],
          grammarRules: [{ rule: 'Basic Sentence Structure', explanation: 'Subject + Verb + Object' }],
          sentences: [
            { original: `We are learning about ${topic}.`, translation: `We are studying ${topic}.` },
            { original: 'This is an example sentence.', translation: 'This is a sample sentence.' },
          ],
        },
        imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(topic)}`,
        audioUrl: null,
      };
    }

    const prompt = PROMPTS.lessonGeneration;
    const userPrompt = prompt.userPromptTemplate
      .replace('{{topic}}', topic)
      .replace('{{gradeLevel}}', gradeLevel)
      .replace('{{documentContext}}', documentContext || 'No additional context provided.');

    const messages: any[] = [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: userPrompt },
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

    const aiResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free',
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI provider error: ${aiResponse.status} - ${errText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    try {
      const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return {
        textContent: parsed,
        imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(topic)}`,
        audioUrl: null,
      };
    } catch {
      throw new Error('Failed to parse AI response as JSON');
    }
  });
});
