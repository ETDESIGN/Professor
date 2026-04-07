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
Take the following approved textbook extraction assets and transform them into a playable LessonManifest for a Board Engine.

Force your output to conform EXACTLY to this JSON schema. Return NO OTHER TEXT:

{
  "meta": { "unit_title": "string", "theme": "string", "difficulty_cefr": "string" },
  "knowledge_graph": {
     "vocabulary": [
       { "word": "string", "definition": "string", "distractors":["wrong1", "wrong2", "wrong3"], "image_prompt": "string" }
     ],
     "grammar_rules": [{ "rule": "string", "explanation": "string" }]
  },
  "timeline":[
     // MUST be exactly these 5 ActivityBlocks mapped to the Board Engine:
     { "type": "MEDIA_PLAYER", "title": "Intro", "duration": 5, "data": {} },
     { "type": "FOCUS_CARDS", "title": "Vocab", "duration": 10, "data": {} },
     { "type": "GRAMMAR_SANDBOX", "title": "Grammar", "duration": 10, "data": {} },
     { "type": "GAME_ARENA", "title": "Speed Quiz", "duration": 10, "data": {} },
     { "type": "STORY_STAGE", "title": "Story Time", "duration": 10, "data": {} }
  ]
}`;

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
                        content: JSON.stringify(approvedAssets)
                    }
                ],
                temperature: 0.2,
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
            console.error('JSON parsing failed. Raw:', aiResponseText.substring(0, 200));
            throw new Error(`JSON Schema compliance failed. Raw LLM response: ${aiResponseText}`);
        }

        // Initialize Supabase Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        if (!supabaseUrl || !supabaseKey) {
            console.warn("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, DB update skipped.");
        } else {
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Update DB
            const { error: dbError } = await supabase.from('units').update({
                status: 'published',
                flow: parsedResponse.timeline
            }).eq('id', unitId);

            if (dbError) throw dbError;
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
