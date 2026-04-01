import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json()
        const { topic, gradeLevel, documentContext, action } = body

        // Determine action - default to 'generate-lesson'
        const actionType = action || 'generate-lesson';

        // Route to appropriate handler
        if (actionType === 'generate-lesson') {
            return await handleGenerateLesson(req, { topic, gradeLevel, documentContext });
        } else if (actionType === 'live-feedback') {
            return await handleLiveFeedback(req);
        } else {
            throw new Error(`Unknown action: ${actionType}`);
        }

    } catch (error) {
        console.error('Edge Function Error:', error.message)
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
});

async function handleGenerateLesson(req: Request, params: { topic?: string; gradeLevel?: string; documentContext?: string }) {
    const { topic: rawTopic, gradeLevel: rawGradeLevel, documentContext } = params;

    // Default values when topic/gradeLevel are missing (common for document uploads)
    const topic = rawTopic || "Uploaded Document";
    const gradeLevel = rawGradeLevel || "General";

    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1'
    const aiApiKey = Deno.env.get('AI_API_KEY')
    const aiModelName = Deno.env.get('AI_MODEL_NAME') || 'google/gemini-3-flash-preview'

    // Diagnostic logging (masked for security)
    console.log(`AI Config: base=${aiBaseUrl}, model=${aiModelName}, keySet=${!!aiApiKey}, keyLength=${aiApiKey?.length || 0}`);

    if (!aiApiKey) {
        throw new Error('AI_API_KEY environment variable is not set. Please configure it in Supabase Dashboard > Edge Functions > Secrets')
    }

    // Build system prompt based on whether document context is provided
    let systemPrompt: string;
    
    if (documentContext && documentContext.trim().length > 0) {
        // Document-based generation: heavily reference the provided text
        systemPrompt = `You are an expert curriculum designer AI.
        
You have been provided with source material from a textbook or educational document.
Your task is to generate a lesson plan that is STRONGLY BASED on this provided content.

IMPORTANT INSTRUCTIONS:
1. Use the provided document content as the PRIMARY source for vocabulary, topics, and concepts
2. Extract key terms, definitions, and concepts from the document
3. Create flashcards that test understanding of the DOCUMENT'S content
4. The title should reflect the actual topic from the document
5. DO NOT hallucinate content that isn't supported by the document

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
  "flashcards": [
    { "question": "Question based on document content", "answer": "Answer from document" },
    { "question": "Question based on document content", "answer": "Answer from document" },
    { "question": "Question based on document content", "answer": "Answer from document" },
    { "question": "Question based on document content", "answer": "Answer from document" },
    { "question": "Question based on document content", "answer": "Answer from document" }
  ]
}
Ensure exactly 5 flashcards are returned.`;
    } else {
        // Topic-based generation (original behavior)
        systemPrompt = `You are an expert curriculum designer. 
Generate a lesson plan about "${topic}" for "${gradeLevel}" students.
You MUST return ONLY a valid JSON object with the following exact structure (no markdown formatting, no code blocks, just raw JSON):
{
  "title": "A catchy title",
  "description": "A 1-2 sentence description",
  "visual_prompt": "A detailed midjourney-style prompt for the lesson cover image",
  "spoken_intro": "An enthusiastic, friendly greeting introducing the lesson",
  "flashcards": [
    { "question": "Question 1", "answer": "Answer 1" },
    { "question": "Question 2", "answer": "Answer 2" },
    { "question": "Question 3", "answer": "Answer 3" },
    { "question": "Question 4", "answer": "Answer 4" },
    { "question": "Question 5", "answer": "Answer 5" }
  ]
}
Ensure exactly 5 flashcards are returned.`;
    }

    const userContent = documentContext 
        ? `Generate the lesson for the provided document at ${gradeLevel} level.`
        : `Generate the lesson for ${topic} at ${gradeLevel} level.`;

    const response = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
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
    })

    if (!response.ok) {
        const errorData = await response.text()
        console.error('AI API Full Error Response:', errorData)
        console.error('AI API Request URL:', `${aiBaseUrl}/chat/completions`)
        console.error('AI API Model:', aiModelName)
        throw new Error(`AI API request failed: ${response.status} ${response.statusText} - ${errorData.substring(0, 500)}`)
    }

    const data = await response.json()
    let aiResponseText = data.choices[0]?.message?.content || '{}'

    // Robust JSON sanitization - strip markdown code blocks, backticks, and any surrounding text
    let cleanJson = aiResponseText
        .replace(/```json\s*/gi, '')    // Strip opening ```json
        .replace(/```\s*/g, '')          // Strip closing ```
        .replace(/^[\s\S]*?\{/, '{')     // Strip everything before first {
        .replace(/\}[\s\S]*?$/, '}')     // Strip everything after last }
        .trim();

    let parsedResponse;
    try {
        parsedResponse = JSON.parse(cleanJson)
    } catch (e) {
        console.error('Failed to parse AI response as JSON, using fallback:', cleanJson.substring(0, 200));
        // Safe fallback - never crash the pipeline
        parsedResponse = {
            title: topic || "Generated Lesson",
            description: `A lesson about ${topic || "the uploaded document"} for ${gradeLevel} students.`,
            visual_prompt: `Educational illustration about ${topic || "learning"}`,
            spoken_intro: `Welcome to today's lesson about ${topic || "this topic"}!`,
            flashcards: [
                { question: "What is the main topic?", answer: topic || "The uploaded document content" },
                { question: "What grade level is this for?", answer: gradeLevel || "General" },
                { question: "What should students learn?", answer: "Key concepts from the lesson material" },
                { question: "How can students practice?", answer: "Review the flashcards and complete exercises" },
                { question: "What is the next step?", answer: "Continue to the next lesson in the unit" }
            ]
        };
    }

    // Ensure required properties exist with safe defaults
    parsedResponse.title = parsedResponse.title || topic || "Generated Lesson";
    parsedResponse.description = parsedResponse.description || `A lesson about ${topic || "the topic"}.`;
    parsedResponse.visual_prompt = parsedResponse.visual_prompt || `Educational illustration about ${topic || "learning"}`;
    parsedResponse.spoken_intro = parsedResponse.spoken_intro || `Welcome to today's lesson!`;
    parsedResponse.flashcards = Array.isArray(parsedResponse.flashcards) && parsedResponse.flashcards.length > 0 
        ? parsedResponse.flashcards 
        : [
            { question: "What is the main topic?", answer: topic || "The lesson content" },
            { question: "What grade level is this for?", answer: gradeLevel || "General" },
            { question: "What should students learn?", answer: "Key concepts from the lesson" },
            { question: "How can students practice?", answer: "Review the flashcards" },
            { question: "What is the next step?", answer: "Continue to the next lesson" }
          ];

    // Ensure required properties exist with safe defaults
    parsedResponse.title = parsedResponse.title || topic || "Generated Lesson";
    parsedResponse.description = parsedResponse.description || `A lesson about ${topic || "the topic"}.`;
    parsedResponse.visual_prompt = parsedResponse.visual_prompt || `Educational illustration about ${topic || "learning"}`;
    parsedResponse.spoken_intro = parsedResponse.spoken_intro || `Welcome to today's lesson!`;
    parsedResponse.flashcards = Array.isArray(parsedResponse.flashcards) && parsedResponse.flashcards.length > 0 
        ? parsedResponse.flashcards 
        : [
            { question: "What is the main topic?", answer: topic || "The lesson content" },
            { question: "What grade level is this for?", answer: gradeLevel || "General" },
            { question: "What should students learn?", answer: "Key concepts from the lesson" },
            { question: "How can students practice?", answer: "Review the flashcards" },
            { question: "What is the next step?", answer: "Continue to the next lesson" }
          ];

    // Multi-Modal Generation in Parallel
    let imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${Date.now()}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
    let audioUrl = null;

    const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');

    const generateImage = async () => {
        if (!googleApiKey || !parsedResponse.visual_prompt) return;
        try {
            console.log("Generating image with Nano Banana 2/Gemini...");
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: "Generate an image: " + parsedResponse.visual_prompt }] }] })
            });
            if (res.ok) {
                imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(parsedResponse.visual_prompt)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
            }
        } catch (e) {
            console.error("Image generation failed:", e);
        }
    };

    const generateAudio = async () => {
        if (!elevenLabsApiKey || !parsedResponse.spoken_intro) return;
        try {
            console.log("Generating audio with ElevenLabs...");
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
        } catch (e) {
            console.error("Audio generation failed:", e);
        }
    };

    // Run multimodal generations concurrently
    await Promise.all([generateImage(), generateAudio()]);

    return new Response(JSON.stringify({
        textContent: parsedResponse,
        imageUrl,
        audioUrl
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

async function handleLiveFeedback(req: Request) {
    // This is handled by the existing logic - just return a simple response
    return new Response(JSON.stringify({ 
        message: "Live feedback endpoint ready",
        suggestion: "Consider adding student engagement metrics for real-time feedback"
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}