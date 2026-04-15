import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    try {
        if (req.method === 'OPTIONS') {
            return new Response('ok', { headers: corsHeaders });
        }

        const body = await req.json();
        const { unitId, approvedAssets } = body;

        if (!unitId || !approvedAssets) throw new Error("Missing unitId or approvedAssets");

        const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
        const aiApiKey = Deno.env.get('AI_API_KEY');
        const aiModelName = Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free';

        if (!aiApiKey) {
            throw new Error('AI_API_KEY environment variable is not set.');
        }

        const systemPrompt = `You are a Master Educational Game Designer.
Analyze the following approved textbook extraction assets (vocabulary, exercises, and pedagogy) and transform them into a fully-populated, playable LessonManifest for a Board Game Engine.

You MUST use the actual vocabulary words and exercises from the input. Do NOT leave data fields empty.

Force your output to conform EXACTLY to this JSON schema. Return NO OTHER TEXT:

{
  "meta": { "unit_title": "string", "theme": "string", "difficulty_cefr": "string (e.g. A1, A2, B1)" },
  "knowledge_graph": {
     "vocabulary": [
       { "word": "string", "definition": "string", "distractors": ["wrong1", "wrong2", "wrong3"], "image_prompt": "string (visual description for image generation)" }
     ],
     "grammar_rules": [{ "rule": "string", "explanation": "string" }]
  },
  "timeline": [
    {
      "id": "step_1",
      "type": "MEDIA_PLAYER",
      "title": "Intro",
      "duration": 5,
      "teacherGuide": { "instruction": "Introduce today's topic.", "script": "Today we are going to learn about [topic]." },
      "data": { "title": "string", "videoThumbnail": "", "lyrics": [] }
    },
    {
      "id": "step_2",
      "type": "FOCUS_CARDS",
      "title": "Vocabulary",
      "duration": 10,
      "teacherGuide": { "instruction": "Drill pronunciation. Use Flip to reveal the word.", "script": "Repeat after me." },
      "data": {
        "title": "New Vocabulary",
        "cards": [
          { "id": "c_0", "front": "📸", "back": "word", "pronunciation": "/word/", "image": "" }
        ]
      }
    },
    {
      "id": "step_3",
      "type": "GRAMMAR_SANDBOX",
      "title": "Grammar",
      "duration": 10,
      "teacherGuide": { "instruction": "Explain the grammar rule on the board.", "script": "Let's look at how we use [rule]." },
      "data": { "rule": "string", "formula": "string", "examples": ["string"] }
    },
    {
      "id": "step_4",
      "type": "GAME_ARENA",
      "title": "Speed Quiz",
      "duration": 10,
      "teacherGuide": { "instruction": "Teams compete. Read the question, first to answer wins!", "script": "Who knows the answer? Team 1?" },
      "data": {
        "topic": "string",
        "questions": [
          { "id": "q_0", "text": "What does [word] mean?", "image": "", "options": ["correct", "wrong1", "wrong2", "wrong3"], "correct": "correct" }
        ]
      }
    },
    {
      "id": "step_5",
      "type": "STORY_STAGE",
      "title": "Story Time",
      "duration": 10,
      "teacherGuide": { "instruction": "Read aloud, then assign character roles.", "script": "Let's see what happens in our story." },
      "data": { "pages": [{ "id": "p1", "text": "A short story using the vocabulary words." }], "readingLevels": {} }
    }
  ]
}

IMPORTANT RULES:
1. Populate "cards" in FOCUS_CARDS with EVERY vocabulary word from the input.
2. Populate "questions" in GAME_ARENA with quiz questions derived from the vocabulary (use distractors as wrong answers).
3. The "grammar_rules" and GRAMMAR_SANDBOX data must reflect any grammar patterns found in the exercises.
4. Return ONLY the JSON. No markdown, no explanation.`;

        console.log(`Starting orchestration for unit ${unitId} using model ${aiModelName}`);

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
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: `Transform these approved textbook extraction assets into a playable lesson:\n\n${JSON.stringify(approvedAssets, null, 2)}`
                    }
                ],
                temperature: 0.3,
            })
        });

        if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            throw new Error(`AI Request Failed: ${aiResponse.status} - ${errText.substring(0, 300)}`);
        }

        const data = await aiResponse.json();
        const aiResponseText = data.choices?.[0]?.message?.content || '{}';

        // Robust JSON sanitization using regex to bypass any markdown wrapping
        const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
        const cleanJson = jsonMatch ? jsonMatch[0] : aiResponseText;

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(cleanJson);
        } catch (e) {
            console.error('JSON parsing failed. Raw:', aiResponseText.substring(0, 300));
            throw new Error(`JSON Schema compliance failed. Raw LLM response: ${aiResponseText.substring(0, 300)}`);
        }

        // Initialize Supabase Client with service role to bypass RLS
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        if (!supabaseUrl || !supabaseKey) {
            console.warn("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, DB update skipped.");
        } else {
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Phase A Fix: Update units with 'Active' status (satisfies DB check constraint)
            const { error: dbError } = await supabase.from('units').update({
                status: 'Active',
                flow: parsedResponse.timeline,
                manifest: parsedResponse
            }).eq('id', unitId);

            if (dbError) throw new Error(`DB update failed: ${dbError.message}`);

            // Phase C: Insert vocabulary into srs_items for spaced repetition
            const vocabulary = parsedResponse.knowledge_graph?.vocabulary;
            if (vocabulary && vocabulary.length > 0) {
                const srsItems = vocabulary.map((v: any) => ({
                    unit_id: unitId,
                    student_id: 'unit_template',
                    word: v.word || '',
                    translation: v.definition || '',
                    interval: 0,
                    repetition: 0,
                    efactor: 2.5,
                }));

                const { error: srsError } = await supabase.from('srs_items').insert(srsItems);
                if (srsError) {
                    // Non-fatal: log but don't crash the response
                    console.error('SRS insert failed (non-fatal):', srsError.message);
                }
            }
        }

        return new Response(JSON.stringify({ success: true, metadata: { unitId }, orchestration: parsedResponse }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('Edge Function Error:', error.message);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }
});
