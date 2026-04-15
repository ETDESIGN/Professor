import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
        const { fileUrl, pageNumber } = body;

        if (!fileUrl) throw new Error("Missing fileUrl");

        const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
        const aiApiKey = Deno.env.get('AI_API_KEY');
        const aiModelName = Deno.env.get('VISION_MODEL_NAME') || Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free';

        if (!aiApiKey) {
            throw new Error('AI_API_KEY environment variable is not set.');
        }

        const systemPrompt = `You are an Expert ESL Curriculum Designer and meticulous transcriber. Analyze the images, diagrams, and exercises to deduce the true learning objectives. If words are pointing to pictures (like a vocab map), extract them as vocabulary. If there is a comic or story, you MUST extract it panel-by-panel. If there is a grammar box, you MUST extract the exact formulas and examples.

Force your output to conform EXACTLY to this JSON schema. Return NO OTHER TEXT:

{
  "page_type": "MIXED",
  "pedagogy": {
     "topic": "string (e.g., Vehicles and Places)",
     "learning_objectives": ["string"],
     "visual_context": "string (Detailed description of the images/diagrams)"
  },
  "extracted_content": {
     "vocabulary": [{"word": "string", "definition_or_context": "string"}],
     "reading_text": "string (Any main paragraphs)",
     "comic_panels": [
        { "panel_number": 1, "context": "string", "dialogues": [{"character": "string", "text": "EXACT extracted text"}] }
     ],
     "grammar_boxes": [
        { "title": "string", "formulas_and_examples": ["EXACT extracted text (e.g. 'Are there any animals? Yes, there are.')"] }
     ],
     "exercises": [{"instruction": "string", "content": "string"}]
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
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: systemPrompt },
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

        return new Response(JSON.stringify({ success: true, metadata: { pageNumber }, extraction: parsedResponse }), {
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
