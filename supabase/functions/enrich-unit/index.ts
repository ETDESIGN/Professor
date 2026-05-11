import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'enrich-unit',
    requireAuth: true,
    rateLimit: { maxRequests: 20, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'unitId', required: true, type: 'string' },
      { field: 'category', required: false, type: 'string' },
    ],
  }, async (body, _auth) => {
    const { unitId, category = 'all' } = body;
    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
    const aiApiKey = Deno.env.get('AI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!aiApiKey) {
      return { success: false, error: 'AI_API_KEY not configured' };
    }

    const sbClient = createClient(supabaseUrl, supabaseKey);
    const { data: unit, error: unitError } = await sbClient
      .from('units')
      .select('*')
      .eq('id', unitId)
      .single();

    if (unitError || !unit) {
      return { success: false, error: 'Unit not found' };
    }

    const scannedAssets = unit.scanned_assets || [];

    const allVocab: any[] = [];
    let topic = unit.topic || '';
    let gradeLevel = 'Beginner';
    let extractedText = '';

    for (const asset of scannedAssets) {
      const meta = asset?.metadata || asset || {};
      if (meta.topic) topic = meta.topic;
      if (meta.gradeLevel) gradeLevel = meta.gradeLevel;
      if (meta.extractedText) extractedText += meta.extractedText + '\n';
      if (Array.isArray(meta.vocabulary)) {
        allVocab.push(...meta.vocabulary);
      }
    }

    if (allVocab.length === 0 && !extractedText) {
      return { success: false, error: 'No content found to enrich. Upload and extract pages first.' };
    }

    const models = [
      Deno.env.get('AI_MODEL_NAME') || 'google/gemma-3-27b-it:free',
      Deno.env.get('FALLBACK_MODEL_NAME') || 'meta-llama/llama-3.3-70b-instruct:free',
    ];

    async function callAI(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<any> {
      for (const modelName of models) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout for progressive loads
          
          const resp = await fetch(`${aiBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelName,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature,
              max_tokens: category === 'all' ? 2000 : 800,
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (!resp.ok) {
             const errBody = await resp.text().catch(() => '');
             console.error(`OpenRouter HTTP ${resp.status} for ${modelName}:`, errBody.substring(0, 200));
             continue;
          }
          const data = await resp.json();
          if (data.error) {
             console.error(`OpenRouter API error for ${modelName}:`, data.error);
             continue; // try next model
          }
          let content = data.choices?.[0]?.message?.content || '{}';
          content = content.replace(/```json/g, '').replace(/```/g, '').trim();

          if (supabaseUrl && supabaseKey && data.usage) {
            const sb = createClient(supabaseUrl, supabaseKey);
            await sb.from('llm_telemetry').insert({
              function_name: 'enrich-unit',
              model_used: data.model || modelName,
              prompt_tokens: data.usage.prompt_tokens || 0,
              completion_tokens: data.usage.completion_tokens || 0,
              total_tokens: data.usage.total_tokens || 0,
            });
          }

          return JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || content.match(/\[[\s\S]*\]/)?.[0] || '{}');
        } catch { /* try next model */ }
      }
      return null;
    }

    let expectedOutputFormat = '';
    let categoryRules = '';

    switch (category) {
      case 'vocabulary':
        expectedOutputFormat = `{ "title": "Unit title", "topic": "Main topic", "gradeLevel": "A1/A2/B1", "description": "2-3 sentence unit description", "vocabulary": [ { "word": "word", "definition": "simple definition", "example_sentence": "sentence", "translation": "translation", "image_prompt": "prompt", "distractors": ["wrong1", "wrong2"] } ] }`;
        categoryRules = "- Extract exactly 5-8 key vocabulary words\n- Include child-friendly definitions, sentences, and translations.";
        break;
      case 'grammar':
        expectedOutputFormat = `{ "grammar": [ { "rule": "rule name", "explanation": "simple explanation", "examples": ["example 1", "example 2"] } ] }`;
        categoryRules = "- Extract exactly 1-2 core grammar rules\n- Include simple explanations and 3 examples each.";
        break;
      case 'characters':
        expectedOutputFormat = `{ "characters": [ { "name": "name", "role": "teacher/student", "personality": "brave/smart", "image_prompt": "visual prompt" } ] }`;
        categoryRules = "- Create exactly 2-4 fun characters suitable for children\n- Give them distinct roles and personalities.";
        break;
      case 'story':
        expectedOutputFormat = `{ "story": { "title": "story title", "setting": "where it happens", "pages": [ { "text": "story text", "speaker": "name", "image_prompt": "scene prompt" } ] } }`;
        categoryRules = "- Write exactly 3-4 story pages using the target vocabulary\n- Make the story highly engaging for a child.";
        break;
      case 'media':
        expectedOutputFormat = `{ "song_suggestions": [ { "title": "song", "topic_relevance": "why it fits", "search_query": "query" } ], "video_suggestions": [ { "title": "video", "topic_relevance": "why it fits", "search_query": "query" } ] }`;
        categoryRules = "- Suggest exactly 2 existing children's songs with YouTube queries\n- Suggest exactly 2 educational videos with YouTube queries.";
        break;
      case 'dialogues':
        expectedOutputFormat = `{ "dialogues": [ { "title": "dialogue name", "lines": [ {"speaker": "name", "text": "dialogue text"} ] } ] }`;
        categoryRules = "- Write exactly 1-2 realistic dialogues using the target vocabulary.";
        break;
      default:
        expectedOutputFormat = `{ "title": "...", "topic": "...", "gradeLevel": "...", "description": "...", "vocabulary": [], "grammar": [], "characters": [], "story": {"title":"", "setting":"", "pages":[]}, "song_suggestions": [], "video_suggestions": [], "dialogues": [] }`;
        categoryRules = "- 6-10 vocabulary words\n- 1-2 grammar rules\n- 2-4 characters\n- 3-5 story pages\n- 2-3 songs and videos\n- 1-2 dialogues";
        break;
    }

    const enrichSystemPrompt = `You are Professor AI, an expert ESL/EFL curriculum designer for children aged 6-12.
Given raw extracted text and vocabulary from a textbook page, extract ONLY the requested category of content.
Return ONLY valid JSON matching the exact requested format (no markdown).`;

    const enrichUserPrompt = `Topic: ${topic}
Grade Level: ${gradeLevel}
Extracted Text: ${extractedText.slice(0, 8000)}
Raw Vocabulary Found: ${JSON.stringify(allVocab.slice(0, 20))}

Generate the requested content for this unit.
Return JSON in exactly this format:
${expectedOutputFormat}

Rules:
${categoryRules}
- All content must be age-appropriate and culturally sensitive.`;

    const enriched = await callAI(enrichSystemPrompt, enrichUserPrompt, 0.7);

    if (!enriched) {
      return { success: false, error: `AI enrichment failed for category: ${category}. Please try again.` };
    }

    // Prepare images
    if (enriched.vocabulary) {
      enriched.vocabulary = enriched.vocabulary.map((v: any) => ({
        ...v,
        image_url: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word || 'item')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`,
        image_status: 'pending' as const,
      }));
    }
    if (enriched.characters) {
      enriched.characters = enriched.characters.map((ch: any) => ({
        ...ch,
        image_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ch.name || 'char')}`,
        image_status: 'pending' as const,
      }));
    }

    // Merge with existing manifest in DB - FETCH FRESH TO AVOID PARALLEL RACE CONDITIONS!
    const { data: freshUnit } = await sbClient.from('units').select('manifest').eq('id', unitId).single();
    const currentManifest = freshUnit?.manifest?.enriched_content || {
      title: '', topic: '', gradeLevel: 'A1', description: '',
      vocabulary: [], grammar: [], characters: [], story: { title: '', setting: '', pages: [] },
      song_suggestions: [], video_suggestions: [], dialogues: []
    };

    const mergedManifest = { ...currentManifest, ...enriched };
    if (enriched.story) {
      mergedManifest.story = { ...currentManifest.story, ...enriched.story };
    }

    await sbClient
      .from('units')
      .update({
        manifest: { 
          meta: { 
            unit_title: mergedManifest.title || unit.title, 
            theme: mergedManifest.topic || topic, 
            difficulty_cefr: mergedManifest.gradeLevel 
          }, 
          enriched_content: mergedManifest 
        },
        topic: mergedManifest.topic || unit.topic || topic,
        title: mergedManifest.title || unit.title,
      })
      .eq('id', unitId);

    return {
      success: true,
      unitId,
      category,
      enriched: mergedManifest,
    };
  });
});
