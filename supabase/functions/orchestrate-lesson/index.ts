import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createLogger } from '../_shared/logger.ts'
import { authenticateRequest, AuthError } from '../_shared/authMiddleware.ts'
import { checkRateLimit, extractIdentifier, rateLimitHeaders } from '../_shared/rateLimit.ts'
import { handleHealthCheck } from '../_shared/health.ts'

const log = createLogger('orchestrate-lesson')

async function generateMediaAsync(
  supabaseUrl: string,
  supabaseKey: string,
  unitId: string,
  parsedResponse: any,
  flowArray: any[],
  geminiKey: string | undefined,
  elevenlabsKey: string | undefined,
  log: any
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey)
  const vocabulary = parsedResponse?.knowledge_graph?.vocabulary || []

  const updatedFlow = [...flowArray]

  for (let i = 0; i < vocabulary.length; i++) {
    const v = vocabulary[i]
    if (!v.word) continue

    if (geminiKey) {
      try {
        const imagePrompt = `A colorful cartoon illustration of "${v.word}" for a children's English lesson. Clean background, no text, friendly style.`
        const hash = imagePrompt.split('').reduce((a: number, c: string) => ((a << 5) - a + c.charCodeAt(0)) & a, 0)

        const { data: existing } = await supabase
          .from('assets')
          .select('public_url')
          .eq('unit_id', unitId)
          .eq('type', 'image')
          .eq('metadata->>promptHash', Math.abs(hash).toString(36))
          .limit(1)

        let imageUrl = existing?.[0]?.public_url || ''

        if (!imageUrl) {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiKey}`
          const imgResp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: imagePrompt }] }],
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.4 }
            })
          })

          if (imgResp.ok) {
            const imgData = await imgResp.json()
            const imagePart = imgData?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)
            if (imagePart) {
              const ext = (imagePart.inlineData.mimeType || 'image/png').includes('png') ? 'png' : 'jpg'
              const storagePath = `${unitId}/images/vocab_${i}.${ext}`
              const bytes = Uint8Array.from(atob(imagePart.inlineData.data), (c: string) => c.charCodeAt(0))
              const { error: uploadErr } = await supabase.storage.from('generated-media').upload(storagePath, bytes, { contentType: imagePart.inlineData.mimeType || 'image/png', upsert: true })
              if (!uploadErr) {
                const { data: urlData } = supabase.storage.from('generated-media').getPublicUrl(storagePath)
                imageUrl = urlData?.publicUrl || ''
                await supabase.from('assets').insert({ unit_id: unitId, type: 'image', prompt: imagePrompt, storage_path: storagePath, public_url: imageUrl, metadata: { promptHash: Math.abs(hash).toString(36) } })
              }
            }
          }
        }

        if (imageUrl) {
          for (const step of updatedFlow) {
            if (step.type === 'FOCUS_CARDS' && step.data?.cards) {
              const card = step.data.cards.find((c: any) => c.back === v.word)
              if (card) card.image = imageUrl
            }
          }
        }
      } catch (err: any) {
        log.warn('image_gen_skip', { error: err.message, metadata: { word: v.word } })
      }
    }

    if (elevenlabsKey && v.word) {
      try {
        const text = v.context_sentence || v.word
        const hash = `audio:${text}`.split('').reduce((a: number, c: string) => ((a << 5) - a + c.charCodeAt(0)) & a, 0)

        const { data: existing } = await supabase
          .from('assets')
          .select('public_url')
          .eq('unit_id', unitId)
          .eq('type', 'audio')
          .eq('metadata->>promptHash', Math.abs(hash).toString(36))
          .limit(1)

        let audioUrl = existing?.[0]?.public_url || ''

        if (!audioUrl) {
          const audioResp = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
            method: 'POST',
            headers: { 'xi-api-key': elevenlabsKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
          })

          if (audioResp.ok) {
            const audioBuffer = new Uint8Array(await audioResp.arrayBuffer())
            const storagePath = `${unitId}/audio/vocab_${i}.mp3`
            const { error: uploadErr } = await supabase.storage.from('generated-media').upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from('generated-media').getPublicUrl(storagePath)
              audioUrl = urlData?.publicUrl || ''
              await supabase.from('assets').insert({ unit_id: unitId, type: 'audio', prompt: text, storage_path: storagePath, public_url: audioUrl, metadata: { promptHash: Math.abs(hash).toString(36) } })
            }
          }
        }

        if (audioUrl) {
          for (const step of updatedFlow) {
            if (step.type === 'FOCUS_CARDS' && step.data?.cards) {
              const card = step.data.cards.find((c: any) => c.back === v.word)
              if (card) card.audioUrl = audioUrl
            }
          }
        }
      } catch (err: any) {
        log.warn('audio_gen_skip', { error: err.message, metadata: { word: v.word } })
      }
    }
  }

  const { error: flowUpdateErr } = await supabase.from('units').update({ flow: updatedFlow }).eq('id', unitId)
  if (flowUpdateErr) {
    log.warn('flow_update_after_media_failed', { error: flowUpdateErr.message })
  } else {
    log.info('media_gen_complete', { metadata: { unitId, vocabProcessed: vocabulary.length } })
  }
}

serve(async (req) => {
  const startTime = Date.now()

  try {
    const healthResponse = handleHealthCheck(req)
    if (healthResponse) return healthResponse

    const corsResponse = handleCors(req)
    if (corsResponse) return corsResponse

    const identifier = extractIdentifier(req)
    const rateLimit = checkRateLimit(identifier, { maxRequests: 20, windowMs: 60 * 1000 })
    if (!rateLimit.allowed) {
      log.warn('rate_limited', { metadata: { identifier } })
      return errorResponse('Rate limit exceeded. Please try again later.', 429, rateLimitHeaders(rateLimit.remaining, rateLimit.retryAfterMs))
    }

    let userId: string | undefined
    try {
      const auth = await authenticateRequest(req)
      userId = auth.userId
    } catch (authErr) {
      if (authErr instanceof AuthError) {
        log.warn('auth_failed', { error: authErr.message })
        return errorResponse(authErr.message, authErr.status)
      }
    }

    const body = await req.json()
    const { unitId, approvedAssets } = body

    if (!unitId || !approvedAssets) throw new Error("Missing unitId or approvedAssets")

    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1'
    const aiApiKey = Deno.env.get('AI_API_KEY')
    const aiModelName = Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free'

    if (!aiApiKey) {
      throw new Error('AI_API_KEY environment variable is not set.')
    }

    log.info('orchestration_start', { userId, metadata: { unitId, model: aiModelName } })

    const systemPrompt = `You are a Master Educational Game Designer.
Analyze the following approved textbook extraction assets (vocabulary, exercises, and pedagogy) and transform them into a fully-populated, playable LessonManifest for a Board Game Engine.

You MUST use the actual vocabulary words and exercises from the input. Do NOT leave data fields empty.

Force your output to conform EXACTLY to this JSON schema. Return NO OTHER TEXT:

{
  "meta": { "unit_title": "string", "theme": "string", "difficulty_cefr": "string" },
  "theme_context": {
     "setting": "string (e.g., A busy city bus stop)",
     "characters": [{ "name": "string", "role": "string", "emoji": "string" }],
     "world_description": "string (detailed description of the world)"
  },
  "knowledge_graph": {
     "vocabulary":[{
       "word": "string",
       "definition": "string",
       "context_sentence": "string (a sentence using this word, set in the theme_context world)",
       "distractors": ["w1", "w2", "w3"]
     }],
     "grammar_rules": [{ "rule": "string", "explanation": "string", "world_examples": ["sentence in theme world"] }]
  }
}

IMPORTANT RULES:
1. Generate the semantic LessonManifest ONLY. No timeline.
2. Every vocabulary item MUST have a context_sentence that uses the word naturally within the theme_context setting and characters.
3. Every grammar rule MUST have world_examples using the theme_context characters and setting.
4. The context_sentence must NOT use generic phrases like "lives in the jungle". It must be specific to the unit's theme.
5. Return ONLY the JSON. No markdown, no explanation.`

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
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      throw new Error(`AI Request Failed: ${aiResponse.status} - ${errText.substring(0, 300)}`)
    }

    const data = await aiResponse.json()
    const aiResponseText = data.choices?.[0]?.message?.content || '{}'

    const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/)
    const cleanJson = jsonMatch ? jsonMatch[0] : aiResponseText

    let parsedResponse
    try {
      parsedResponse = JSON.parse(cleanJson)
    } catch (e) {
      log.error('json_parse_failed', { error: `Invalid JSON from LLM`, metadata: { rawLength: aiResponseText.length } })
      throw new Error(`JSON Schema compliance failed. Raw LLM response: ${aiResponseText.substring(0, 300)}`)
    }

    const transformManifestToFlow = (manifest: any) => {
      const defaultTitle = manifest?.meta?.unit_title || "Lesson"
      const theme = manifest?.meta?.theme || "this topic"
      const vocabulary = manifest?.knowledge_graph?.vocabulary || []
      const grammarRules = manifest?.knowledge_graph?.grammar_rules || []
      const themeCtx = manifest?.theme_context
      const characters = themeCtx?.characters || []

      const flow: any[] = [
        {
          id: crypto.randomUUID(),
          type: "INTRO_SPLASH",
          title: `Welcome: ${defaultTitle}`,
          duration: 5,
          teacherGuide: { instruction: "Introduce today's topic and world.", script: `Today we are going to learn about ${theme}. ${themeCtx?.world_description || ''}` },
          data: {
            theme: theme,
            title: defaultTitle,
            setting: themeCtx?.setting || "",
            characters: characters
          }
        },
        {
          id: crypto.randomUUID(),
          type: "MEDIA_PLAYER",
          title: `Warm Up: ${theme}`,
          duration: 300,
          teacherGuide: { instruction: "Play a warm-up song or video related to the theme.", script: `Let's start with a song about ${theme}!` },
          data: {
            title: `${theme} Warm Up`,
            videoUrl: "",
            videoThumbnail: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(theme + '-media')}`,
            lyrics: [],
            audioUrl: ""
          }
        }
      ]

      if (vocabulary.length > 0) {
        flow.push({
          id: crypto.randomUUID(),
          type: "FOCUS_CARDS",
          title: "Vocabulary",
          duration: 10,
          teacherGuide: { instruction: "Drill pronunciation. Use Flip to reveal the word.", script: "Repeat after me." },
          data: {
            title: "New Vocabulary",
            theme: theme,
            cards: vocabulary.map((v: any, i: number) => ({
              id: `c_${i}`,
              front: v.word || "Word",
              back: v.word,
              pronunciation: `/${(v.word || '').toLowerCase()}/`,
              image: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word || 'vocab')}`,
              context_sentence: v.context_sentence || "",
              definition: v.definition || ""
            }))
          }
        })

        const questions = vocabulary.map((v: any, i: number) => ({
          id: `q_${i}`,
          text: `What does "${v.word}" mean?`,
          image: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word || 'vocab')}`,
          options: [v.definition, ...(v.distractors || ['wrong1', 'wrong2', 'wrong3'])].sort(() => Math.random() - 0.5),
          correct: v.definition
        }))

        flow.push({
          id: crypto.randomUUID(),
          type: "GAME_ARENA",
          title: "Speed Quiz",
          duration: 10,
          teacherGuide: { instruction: "Teams compete. Read the question, first to answer wins!", script: "Who knows the answer? Team 1?" },
          data: {
            topic: theme,
            questions: questions
          }
        })
      }

      if (grammarRules.length > 0) {
        flow.push({
          id: crypto.randomUUID(),
          type: "GRAMMAR_SANDBOX",
          title: "Grammar",
          duration: 10,
          teacherGuide: { instruction: "Explain the grammar rule on the board.", script: `Let's look at how we use ${grammarRules[0]?.rule || 'this rule'}.` },
          data: {
            rule: grammarRules[0]?.rule || "Grammar Rule",
            explanation: grammarRules[0]?.explanation || "",
            formula: grammarRules[0]?.rule || "Review the formula",
            examples: grammarRules[0]?.world_examples || [grammarRules[0]?.explanation || "Example sentence."],
            setting: themeCtx?.setting || ""
          }
        })
      }

      if (characters.length > 0 && vocabulary.length > 0) {
        const storyPages = vocabulary.slice(0, 5).map((v: any, i: number) => {
          const speaker = characters[i % characters.length]
          return {
            id: `p_${i}`,
            text: v.context_sentence || `${speaker.name} learned about the ${v.word}.`,
            speaker: speaker.name,
            speakerEmoji: speaker.emoji,
            imageUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word || 'story')}`
          }
        })

        flow.push({
          id: crypto.randomUUID(),
          type: "STORY_STAGE",
          title: "Story Time",
          duration: 10,
          teacherGuide: { instruction: "Read the story together. Assign roles to students.", script: `Let's follow ${characters[0]?.name || 'our character'} through the story.` },
          data: {
            title: `Story: ${defaultTitle}`,
            setting: themeCtx?.setting || "",
            characters: characters,
            pages: storyPages
          }
        })
      }

      return flow
    }

    const transformedFlowArray = transformManifestToFlow(parsedResponse)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseKey) {
      log.warn('missing_supabase_config', { error: 'DB update skipped' })
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey)

      const { error: dbError } = await supabase.from('units').update({
        status: 'Active',
        flow: transformedFlowArray,
        manifest: parsedResponse
      }).eq('id', unitId)

      if (dbError) throw new Error(`DB update failed: ${dbError.message}`)

      const vocabulary = parsedResponse.knowledge_graph?.vocabulary
      if (vocabulary && vocabulary.length > 0) {
        const srsItems = vocabulary.map((v: any) => ({
          unit_id: unitId,
          student_id: 'unit_template',
          word: v.word || '',
          translation: v.definition || '',
          interval: 0,
          repetition: 0,
          efactor: 2.5,
        }))

        const { error: srsError } = await supabase.from('srs_items').insert(srsItems)
        if (srsError) {
          log.warn('srs_insert_failed', { error: srsError.message })
        }
      }
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    const elevenlabsKey = Deno.env.get('ELEVENLABS_API_KEY')

    if ((geminiKey || elevenlabsKey) && supabaseUrl && supabaseKey) {
      generateMediaAsync(supabaseUrl, supabaseKey, unitId, parsedResponse, transformedFlowArray, geminiKey, elevenlabsKey, log).catch((err: any) => {
        log.warn('async_media_gen_failed', { error: err.message })
      })
    }

    log.info('orchestration_complete', { userId, durationMs: Date.now() - startTime, metadata: { unitId, vocabCount: parsedResponse?.knowledge_graph?.vocabulary?.length || 0 } })

    return jsonResponse({ success: true, metadata: { unitId }, orchestration: parsedResponse }, 200, rateLimitHeaders(rateLimit.remaining, 0))

  } catch (error: any) {
    log.error('orchestration_failed', { error: error.message, durationMs: Date.now() - startTime })
    return errorResponse(error.message)
  }
})
