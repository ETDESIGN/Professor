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
        const { fileUrl, pageNumber } = body

        if (!fileUrl) throw new Error("Missing fileUrl");

        const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1'
        const aiApiKey = Deno.env.get('AI_API_KEY')
        const aiModelName = Deno.env.get('VISION_MODEL_NAME') || Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free'

        if (!aiApiKey) {
            throw new Error('AI_API_KEY environment variable is not set.')
        }

        const systemPrompt = `You are an expert EdTech AI assistant tasked with scanning textbook pages.
Your job is to look at a single uploaded page, classify it, and extract the raw, structured text with absolute precision.

Force your output to conform EXACTLY to this JSON schema. Return NO OTHER TEXT. No markdown formatting outside of a potential JSON block, but ideally just raw JSON:

{
  "page_type": "COMIC" | "VOCABULARY" | "GRAMMAR" | "EXERCISES" | "READING",
  "extracted_content": {
     // If COMIC: return array of { "character": "string", "dialogue": "string", "panel_description": "string" } under key "comic_panels"
     // If VOCABULARY: return array of { "word": "string", "target_language": "string", "native_translation": "string" } under key "vocabulary"
     // If GRAMMAR: return { "rule_name": "string", "formula": "string", "examples": ["string"] } under key "grammar_rule"
     // Provide only the relevant key inside extracted_content based on the page_type.
  }
}`;

        console.log(`Starting scan for page ${pageNumber} at URL ${fileUrl} using model ${aiModelName}`);

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
                        content: [
                            { type: 'text', text: 'Extract and classify this page based on your strict schema instructions.' },
                            { type: 'image_url', image_url: { url: fileUrl } }
                        ]
                    }
                ],
                temperature: 0.1,
            })
        });

        if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            throw new Error(`AI Request Failed: ${aiResponse.status} - ${errText.substring(0, 300)}`);
        }

        const data = await aiResponse.json();
        let aiResponseText = data.choices?.[0]?.message?.content || '{}';

        // Robust JSON sanitization
        let cleanJson = aiResponseText
            .replace(/```json\s*/gi, '')    // Strip opening ```json
            .replace(/```\s*/g, '')          // Strip closing ```
            .replace(/^[\s\S]*?\{/, '{')     // Strip everything before first {
            .replace(/\}[\s\S]*?$/, '}')     // Strip everything after last }
            .trim();

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(cleanJson);
        } catch (e) {
            console.error('JSON parsing failed. Raw:', aiResponseText.substring(0, 200));
            parsedResponse = {
                page_type: "READING",
                extracted_content: { reading_text: aiResponseText.substring(0, 500) }
            };
        }

        return new Response(JSON.stringify({ success: true, metadata: { pageNumber }, extraction: parsedResponse }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('Edge Function Error:', error.message)
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
});
