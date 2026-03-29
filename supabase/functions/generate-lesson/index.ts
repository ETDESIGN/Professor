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
        const { topic, gradeLevel } = await req.json()

        if (!topic || !gradeLevel) {
            throw new Error('Topic and Grade Level are required')
        }

        const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1'
        const aiApiKey = Deno.env.get('AI_API_KEY')
        const aiModelName = Deno.env.get('AI_MODEL_NAME') || 'mistralai/mistral-7b-instruct:free'

        if (!aiApiKey) {
            throw new Error('AI_API_KEY environment variable is not set')
        }

        const systemPrompt = `You are an expert curriculum designer. 
Generate a lesson plan about "${topic}" for "${gradeLevel}" students.
You MUST return ONLY a valid JSON object with the following exact structure (no markdown formatting, no code blocks, just raw JSON):
{
  "title": "A catchy title",
  "description": "A 1-2 sentence description",
  "flashcards": [
    { "question": "Question 1", "answer": "Answer 1" },
    { "question": "Question 2", "answer": "Answer 2" },
    { "question": "Question 3", "answer": "Answer 3" },
    { "question": "Question 4", "answer": "Answer 4" },
    { "question": "Question 5", "answer": "Answer 5" }
  ]
}
Ensure exactly 5 flashcards are returned.`

        const response = await fetch(`${aiBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: aiModelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Generate the lesson for ${topic} at ${gradeLevel} level.` }
                ],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        })

        if (!response.ok) {
            const errorData = await response.text()
            console.error('AI API Error:', errorData)
            throw new Error(`AI API request failed: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        let aiResponseText = data.choices[0]?.message?.content || '{}'

        // Clean up any potential markdown code blocks returned by overzealous models
        aiResponseText = aiResponseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()

        let parsedResponse;
        try {
            parsedResponse = JSON.parse(aiResponseText)
        } catch (e) {
            console.error('Failed to parse AI response as JSON:', aiResponseText)
            throw new Error('AI returned invalid JSON')
        }

        return new Response(JSON.stringify(parsedResponse), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error('Edge Function Error:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
