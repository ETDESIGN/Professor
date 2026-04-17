import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createLogger } from '../_shared/logger.ts'
import { softAuthenticate } from '../_shared/authMiddleware.ts'
import { checkRateLimit, extractIdentifier, rateLimitHeaders } from '../_shared/rateLimit.ts'
import { handleHealthCheck } from '../_shared/health.ts'

const log = createLogger('generate-lesson')

serve(async (req) => {
    const startTime = Date.now()

    try {
        const healthResponse = handleHealthCheck(req)
        if (healthResponse) return healthResponse

        const corsResponse = handleCors(req)
        if (corsResponse) return corsResponse

        const identifier = extractIdentifier(req)
        const rateLimit = checkRateLimit(identifier, { maxRequests: 30, windowMs: 60 * 1000 })
        if (!rateLimit.allowed) {
            log.warn('rate_limited', { metadata: { identifier } })
            return errorResponse('Rate limit exceeded. Please try again later.', 429, rateLimitHeaders(rateLimit.remaining, rateLimit.retryAfterMs))
        }

        let userId: string | undefined
        const auth = await softAuthenticate(req)
        if (auth) {
            userId = auth.userId
        } else {
            log.warn('auth_missing', { error: 'No valid auth token provided' })
        }

        const body = await req.json()
        const { topic, gradeLevel, documentContext, imageBase64, action } = body

        const actionType = action || 'generate-lesson';

        if (actionType === 'generate-lesson') {
            return await handleGenerateLesson(req, { topic, gradeLevel, documentContext, imageBase64 }, userId, startTime, rateLimit);
        } else if (actionType === 'differentiate') {
            return await handleDifferentiate(req, body, userId, startTime, rateLimit);
        } else if (actionType === 'live-feedback') {
            return await handleLiveFeedback(req, body, userId, startTime, rateLimit);
        } else {
            throw new Error(`Unknown action: ${actionType}`);
        }

    } catch (error: any) {
        log.error('generate_lesson_failed', { error: error.message, durationMs: Date.now() - startTime })
        return errorResponse(error.message);
    }
});

async function handleDifferentiate(req: Request, body: any, userId: string | undefined, startTime: number, rateLimit: any) {
    const { text, theme } = body
    if (!text) throw new Error('Missing text for differentiation')

    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1'
    const aiApiKey = Deno.env.get('AI_API_KEY')
    const aiModelName = Deno.env.get('AI_MODEL_NAME') || 'mistralai/mistral-small-3.1-24b-instruct'

    if (!aiApiKey) throw new Error('AI_API_KEY environment variable is not set.')

    log.info('differentiate_start', { userId, metadata: { textLength: text.length, theme } })

    const prompt = `You are an ESL differentiation expert. Given this text about "${theme || 'education'}", create 3 versions at different reading levels.

Original: "${text}"

Return ONLY a JSON object:
{
  "below": "simplified version (CEFR A1-A2, short sentences, basic vocabulary)",
  "on": "on-level version (CEFR B1, the original adapted slightly)",
  "above": "advanced version (CEFR B2-C1, complex sentences, richer vocabulary)"
}`

    const aiResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${aiApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://professor-ai.vercel.app',
            'X-Title': 'Professor AI'
        },
        body: JSON.stringify({
            model: aiModelName,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4,
        })
    });

    if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        throw new Error(`AI Request Failed: ${aiResponse.status} - ${errText.substring(0, 300)}`);
    }

    const data = await aiResponse.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { below: text, on: text, above: text };

    log.info('differentiate_complete', { userId, durationMs: Date.now() - startTime })

    return jsonResponse({
        success: true,
        below: parsed.below || text,
        on: parsed.on || text,
        above: parsed.above || text
    }, 200, rateLimitHeaders(rateLimit.remaining, 0));
}

async function handleLiveFeedback(req: Request, body: any, userId: string | undefined, startTime: number, rateLimit: any) {
    const { context } = body

    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1'
    const aiApiKey = Deno.env.get('AI_API_KEY')
    const aiModelName = Deno.env.get('AI_MODEL_NAME') || 'mistralai/mistral-small-3.1-24b-instruct'

    if (!aiApiKey) throw new Error('AI_API_KEY environment variable is not set.')

    log.info('live_feedback_start', { userId })

    const prompt = `You are an expert ESL teacher assistant. Based on this classroom context, provide brief, actionable teaching feedback.

Context: ${context || 'General classroom activity'}

Return ONLY a JSON object:
{
  "suggestion": "A specific teaching tip or next step",
  "engagement": "A tip to increase student engagement",
  "differentiation": "A way to adapt for different levels"
}`

    const aiResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${aiApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://professor-ai.vercel.app',
            'X-Title': 'Professor AI'
        },
        body: JSON.stringify({
            model: aiModelName,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
        })
    });

    if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        throw new Error(`AI Request Failed: ${aiResponse.status} - ${errText.substring(0, 300)}`);
    }

    const data = await aiResponse.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    log.info('live_feedback_complete', { userId, durationMs: Date.now() - startTime })

    return jsonResponse({
        success: true,
        suggestion: parsed.suggestion || 'Continue with the current activity.',
        engagement: parsed.engagement || 'Ask students to work in pairs.',
        differentiation: parsed.differentiation || 'Provide sentence frames for lower-level students.'
    }, 200, rateLimitHeaders(rateLimit.remaining, 0));
}

async function handleGenerateLesson(req: Request, params: { topic?: string; gradeLevel?: string; documentContext?: string; imageBase64?: string }, userId: string | undefined, startTime: number, rateLimit: any) {
    const { topic: rawTopic, gradeLevel: rawGradeLevel, documentContext: rawDocumentContext, imageBase64 } = params;

    const topic = rawTopic || "Uploaded Document";
    const gradeLevel = rawGradeLevel || "General";

    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1'
    const aiApiKey = Deno.env.get('AI_API_KEY')
    const aiModelName = Deno.env.get('AI_MODEL_NAME') || 'mistralai/mistral-small-3.1-24b-instruct'

    if (!aiApiKey) {
        throw new Error('AI_API_KEY environment variable is not set. Please configure it in Supabase Dashboard > Edge Functions > Secrets')
    }

    log.info('generate_start', { userId, metadata: { topic, gradeLevel, hasImage: !!imageBase64, model: aiModelName } })

    let documentContext = rawDocumentContext || '';

    if (imageBase64) {
        const visionModel = Deno.env.get('VISION_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free';
        log.info('ocr_start', { metadata: { visionModel } });

        try {
            const ocrResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
                method: 'POST',
                signal: AbortSignal.timeout(120000),
                headers: {
                    'Authorization': `Bearer ${aiApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://professor-ai.vercel.app',
                    'X-Title': 'Professor AI'
                },
                body: JSON.stringify({
                    model: visionModel,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: imageBase64
                                    }
                                },
                                {
                                    type: 'text',
                                    text: `Extract ALL text from this educational image/document. Return ONLY the extracted text, preserving the original structure, headings, vocabulary words, definitions, and any grammatical rules. Do not add commentary or formatting.`
                                }
                            ]
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 4096
                })
            });

            if (ocrResponse.ok) {
                const ocrData = await ocrResponse.json();
                const extractedText = ocrData.choices?.[0]?.message?.content || '';
                log.info('ocr_complete', { metadata: { charCount: extractedText.length } });

                if (extractedText.length > 20) {
                    documentContext = extractedText;
                } else {
                    log.warn('ocr_short_text')
                    documentContext = `Image content: The user uploaded an educational image. The filename is "${rawTopic || 'unknown'}". Use visual educational content to generate vocabulary, grammar rules, and example sentences appropriate for the grade level.`;
                }
            } else {
                const errText = await ocrResponse.text();
                log.warn('ocr_api_failed', { error: `${ocrResponse.status}`, metadata: { detail: errText.substring(0, 200) } });
                documentContext = `Image content: Educational image uploaded. Generate appropriate lesson content for "${rawTopic || 'the topic'}" at "${rawGradeLevel || 'General'}" level.`;
            }
        } catch (ocrError: any) {
            log.warn('ocr_call_failed', { error: ocrError.message });
            documentContext = `Image content: Educational image uploaded. Generate appropriate lesson content for "${rawTopic || 'the topic'}" at "${rawGradeLevel || 'General'}" level.`;
        }
    }

    let systemPrompt: string;
    
    if (documentContext && documentContext.trim().length > 0) {
        systemPrompt = `You are an expert curriculum designer AI.

You have been provided with source material from a textbook or educational document.
Your task is to generate a lesson plan that is STRONGLY BASED on this provided content.

IMPORTANT INSTRUCTIONS:
1. Use the provided document content as the PRIMARY source for vocabulary, topics, and concepts
2. Extract key terms, definitions, and concepts from the document
3. The title should reflect the actual topic from the document
4. DO NOT hallucinate content that isn't supported by the document

SOURCE DOCUMENT:
---
${documentContext}
---

Generate a lesson plan based on the above document for "${gradeLevel}" students.
You MUST return ONLY a valid JSON object with the following exact structure (no markdown formatting, no code blocks, just raw JSON):
{
  "title": "A catchy title derived from the document content",
  "description": "A 1-2 sentence description based on the document",
  "visual_prompt": "A detailed midjourney-style prompt for the lesson cover image",
  "spoken_intro": "An enthusiastic, friendly greeting introducing the lesson from the document",
  "vocabulary": [
    { "word": "key term from document", "definition": "clear definition from the document" },
    { "word": "key term from document", "definition": "clear definition from the document" },
    { "word": "key term from document", "definition": "clear definition from the document" }
  ],
  "grammarRules": [
    { "rule": "grammar rule name", "explanation": "explanation of the rule" }
  ],
  "sentences": [
    { "original": "example sentence from document", "translation": "translation or paraphrase" },
    { "original": "example sentence from document", "translation": "translation or paraphrase" }
  ]
}
CRITICAL: You MUST include "vocabulary", "grammarRules", and "sentences" arrays in your response. These fields are REQUIRED. Return ONLY the JSON object, no other text.`;
    } else {
        systemPrompt = `You are an expert curriculum designer.
Generate a lesson plan about "${topic}" for "${gradeLevel}" students.
You MUST return ONLY a valid JSON object with the following exact structure (no markdown formatting, no code blocks, just raw JSON):
{
  "title": "A catchy title",
  "description": "A 1-2 sentence description",
  "visual_prompt": "A detailed midjourney-style prompt for the lesson cover image",
  "spoken_intro": "An enthusiastic, friendly greeting introducing the lesson",
  "vocabulary": [
    { "word": "key term", "definition": "clear definition" },
    { "word": "key term", "definition": "clear definition" },
    { "word": "key term", "definition": "clear definition" }
  ],
  "grammarRules": [
    { "rule": "grammar rule name", "explanation": "explanation of the rule" }
  ],
  "sentences": [
    { "original": "example sentence", "translation": "translation or paraphrase" },
    { "original": "example sentence", "translation": "translation or paraphrase" }
  ]
}
CRITICAL: You MUST include "vocabulary", "grammarRules", and "sentences" arrays in your response. These fields are REQUIRED. Return ONLY the JSON object, no other text.`;
    }

    const userContent = documentContext 
        ? `Generate the lesson for the provided document at ${gradeLevel} level.`
        : `Generate the lesson for ${topic} at ${gradeLevel} level.`;

    let response: Response | undefined;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            if (attempt > 0) {
                log.info('retry_attempt', { metadata: { attempt: attempt + 1 } });
                await new Promise(r => setTimeout(r, 2000));
            }

            response = await fetch(`${aiBaseUrl}/chat/completions`, {
                method: 'POST',
                signal: AbortSignal.timeout(120000),
                headers: {
                    'Authorization': `Bearer ${aiApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://professor-ai.vercel.app',
                    'X-Title': 'Professor AI'
                },
                body: JSON.stringify({
                    model: aiModelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userContent }
                    ],
                    temperature: 0.7,
                })
            });

            break;

        } catch (fetchError: any) {
            lastError = fetchError;
            log.warn('api_attempt_failed', { error: fetchError.message, metadata: { attempt: attempt + 1 } });
            if (attempt === 2) {
                throw new Error(`Network error connecting to AI after 3 attempts: ${fetchError.message}`);
            }
        }
    }

    if (!response) {
        throw new Error(lastError?.message || 'Failed to get response from AI API');
    }

    if (!response.ok) {
        const errorData = await response.text()
        log.error('ai_api_error', { error: `${response.status}`, metadata: { detail: errorData.substring(0, 300) } })
        throw new Error(`AI API request failed: ${response.status} ${response.statusText} - ${errorData.substring(0, 500)}`)
    }

    const data = await response.json()
    let aiResponseText = data.choices[0]?.message?.content || '{}'

    let cleanJson = aiResponseText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .replace(/^[\s\S]*?\{/, '{')
        .replace(/\}[\s\S]*?$/, '}')
        .trim();

    let parsedResponse;
    try {
        parsedResponse = JSON.parse(cleanJson)
    } catch (e) {
        log.warn('json_parse_fallback', { metadata: { rawLength: cleanJson.length } })
        parsedResponse = {
            title: topic || "Generated Lesson",
            description: `A lesson about ${topic || "the uploaded document"} for ${gradeLevel} students.`,
            visual_prompt: `Educational illustration about ${topic || "learning"}`,
            spoken_intro: `Welcome to today's lesson about ${topic || "this topic"}!`,
            vocabulary: [
                { word: topic || "Vocabulary", definition: `A key term from ${topic || "the lesson"}` },
                { word: "Lesson", definition: "A period of teaching or learning" },
                { word: "Study", definition: "The activity of learning about a subject" }
            ],
            grammarRules: [
                { rule: "Basic Sentence Structure", explanation: "A sentence needs a subject and a verb to express a complete thought." }
            ],
            sentences: [
                { original: `We are learning about ${topic || "this topic"}.`, translation: `We are studying ${topic || "this subject"}.` },
                { original: "Please open your textbook.", translation: "Please open your book for studying." }
            ]
        };
    }

    if (!Array.isArray(parsedResponse.vocabulary) && Array.isArray(parsedResponse.words)) {
        parsedResponse.vocabulary = parsedResponse.words;
    }
    if (!Array.isArray(parsedResponse.grammarRules) && Array.isArray(parsedResponse.grammar_rules)) {
        parsedResponse.grammarRules = parsedResponse.grammar_rules;
    }
    if (!Array.isArray(parsedResponse.sentences) && Array.isArray(parsedResponse.examples)) {
        parsedResponse.sentences = parsedResponse.examples;
    }
    if (Array.isArray(parsedResponse.sentences)) {
        parsedResponse.sentences = parsedResponse.sentences.map((s: any) => ({
            original: s.original || s.english || s.sentence || s.source || '',
            translation: s.translation || s.target || s.translated || ''
        }));
    }
    if (Array.isArray(parsedResponse.vocabulary)) {
        parsedResponse.vocabulary = parsedResponse.vocabulary.map((v: any) => ({
            word: v.word || v.term || v.key || '',
            definition: v.definition || v.meaning || v.description || ''
        }));
    }
    if (Array.isArray(parsedResponse.grammarRules)) {
        parsedResponse.grammarRules = parsedResponse.grammarRules.map((g: any) => ({
            rule: g.rule || g.name || g.title || '',
            explanation: g.explanation || g.description || g.detail || ''
        }));
    }

    parsedResponse.title = parsedResponse.title || topic || "Generated Lesson";
    parsedResponse.description = parsedResponse.description || `A lesson about ${topic || "the topic"}.`;
    parsedResponse.visual_prompt = parsedResponse.visual_prompt || `Educational illustration about ${topic || "learning"}`;
    parsedResponse.spoken_intro = parsedResponse.spoken_intro || `Welcome to today's lesson!`;

    parsedResponse.vocabulary = Array.isArray(parsedResponse.vocabulary) && parsedResponse.vocabulary.length > 0
        ? parsedResponse.vocabulary
        : [
            { word: topic || "Vocabulary", definition: `A key term from ${topic || "the lesson"}` },
            { word: "Lesson", definition: "A period of teaching or learning" },
            { word: "Study", definition: "The activity of learning about a subject" }
          ];

    parsedResponse.grammarRules = Array.isArray(parsedResponse.grammarRules) && parsedResponse.grammarRules.length > 0
        ? parsedResponse.grammarRules
        : [
            { rule: "Basic Sentence Structure", explanation: "A sentence needs a subject and a verb." }
          ];

    parsedResponse.sentences = Array.isArray(parsedResponse.sentences) && parsedResponse.sentences.length > 0
        ? parsedResponse.sentences
        : [
            { original: `We are learning about ${topic || "this topic"}.`, translation: `We are studying ${topic || "this subject"}.` },
            { original: "Please open your textbook.", translation: "Please open your book for studying." }
          ];

    let imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${Date.now()}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
    let audioUrl = null;

    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');

    const generateImage = async () => {
        if (!googleApiKey || !parsedResponse.visual_prompt) return;
        try {
            log.info('image_gen_start');
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: "Generate an image: " + parsedResponse.visual_prompt }] }] })
            });
            if (res.ok) {
                imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(parsedResponse.visual_prompt)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
            }
        } catch (e: any) {
            log.warn('image_gen_failed', { error: e.message });
        }
    };

    const generateAudio = async () => {
        if (!elevenLabsApiKey || !parsedResponse.spoken_intro) return;
        try {
            log.info('audio_gen_start');
            const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': elevenLabsApiKey
                },
                body: JSON.stringify({
                    text: parsedResponse.spoken_intro,
                    model_id: "eleven_monolingual_v1",
                    voice_settings: { stability: 0.5, similarity_boost: 0.5 }
                })
            });
            if (res.ok) {
                const arrayBuffer = await res.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                audioUrl = `data:audio/mpeg;base64,${base64}`;
            }
        } catch (e: any) {
            log.warn('audio_gen_failed', { error: e.message });
        }
    };

    await Promise.all([generateImage(), generateAudio()]);

    log.info('generate_complete', { userId, durationMs: Date.now() - startTime, metadata: { vocabCount: parsedResponse.vocabulary?.length || 0 } })

    return jsonResponse({
        textContent: parsedResponse,
        imageUrl,
        audioUrl
    }, 200, rateLimitHeaders(rateLimit.remaining, 0));
}
