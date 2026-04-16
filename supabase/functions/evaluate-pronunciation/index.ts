import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createLogger } from '../_shared/logger.ts'
import { authenticateRequest, AuthError } from '../_shared/authMiddleware.ts'
import { checkRateLimit, extractIdentifier, rateLimitHeaders } from '../_shared/rateLimit.ts'
import { handleHealthCheck } from '../_shared/health.ts'

const log = createLogger('evaluate-pronunciation')

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

function calculateSimilarity(spoken: string, target: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const a = normalize(spoken)
  const b = normalize(target)
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0
  const distance = levenshteinDistance(a, b)
  const maxLen = Math.max(a.length, b.length)
  return Math.max(0, 1 - distance / maxLen)
}

function generateDetailedFeedback(similarity: number, target: string, transcript: string, emotionScore: number): string {
  const parts: string[] = []
  if (similarity >= 0.95) {
    parts.push('Perfect pronunciation!')
  } else if (similarity >= 0.8) {
    parts.push(`Good pronunciation. Minor differences detected.`)
  } else if (similarity >= 0.6) {
    parts.push(`Almost there. Listen carefully to the target: "${target}"`)
  } else {
    parts.push(`Keep practicing. Target phrase: "${target}"`)
  }

  if (transcript.toLowerCase().includes(target.toLowerCase().split(' ')[0])) {
    parts.push('Good start with the first word.')
  }

  if (emotionScore >= 0.7) {
    parts.push('Great emotional expression!')
  } else if (emotionScore >= 0.4) {
    parts.push('Try to put more feeling into your delivery.')
  }

  return parts.join(' ')
}

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
      return errorResponse('Rate limit exceeded.', 429, rateLimitHeaders(rateLimit.remaining, rateLimit.retryAfterMs))
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
    const { audioBase64, targetText, targetEmotion, language } = body

    if (!audioBase64 || !targetText) {
      return errorResponse('Missing required fields: audioBase64, targetText', 400)
    }

    log.info('pronunciation_eval_start', { userId, metadata: { targetTextLength: targetText.length, language: language || 'en' } })

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    const aiBaseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1'
    const aiApiKey = Deno.env.get('AI_API_KEY')

    let transcript = ''
    let whisperConfidence = 0

    if (openaiApiKey) {
      const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
      const audioBlob = new Blob([audioBytes], { type: 'audio/webm' })

      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.webm')
      formData.append('model', 'whisper-1')
      formData.append('language', language || 'en')
      formData.append('response_format', 'verbose_json')

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiApiKey}` },
        body: formData
      })

      if (whisperResponse.ok) {
        const whisperData = await whisperResponse.json()
        transcript = whisperData.text || ''
        whisperConfidence = whisperData.segments?.reduce((sum: number, seg: any) => sum + (seg.avg_logprob || 0), 0) / (whisperData.segments?.length || 1)
      } else {
        log.warn('whisper_failed', { error: `Status ${whisperResponse.status}` })
      }
    } else if (aiApiKey) {
      const aiResponse = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-vl-a3b-thinking:free',
          messages: [
            {
              role: 'system',
              content: 'You are a pronunciation evaluator. Given an audio transcription and a target text, evaluate pronunciation accuracy. Return ONLY valid JSON: {"transcript": "string", "confidence": number, "emotion_score": number}'
            },
            {
              role: 'user',
              content: `Target text: "${targetText}"${targetEmotion ? `\nTarget emotion: ${targetEmotion}` : ''}\n\nAnalyze this audio and provide your evaluation.`
            }
          ],
          temperature: 0.1
        })
      })

      if (aiResponse.ok) {
        const aiData = await aiResponse.json()
        const aiText = aiData.choices?.[0]?.message?.content || '{}'
        try {
          const parsed = JSON.parse(aiText.match(/\{[\s\S]*\}/)?.[0] || '{}')
          transcript = parsed.transcript || ''
          whisperConfidence = parsed.confidence || 0
        } catch {
          log.warn('ai_eval_parse_failed')
        }
      }
    }

    if (!transcript) {
      return jsonResponse({
        success: true,
        evaluation: {
          transcript: '',
          targetText,
          similarity: 0,
          isCorrect: false,
          score: 0,
          feedback: 'Could not process audio. Please try again.',
          emotionMatch: 'low',
          timing: 'unknown',
          confidence: 0
        }
      }, 200, rateLimitHeaders(rateLimit.remaining, 0))
    }

    const similarity = calculateSimilarity(transcript, targetText)
    const normalizedConfidence = Math.max(0, Math.min(1, whisperConfidence > 0 ? (whisperConfidence + 1) / 2 : similarity))
    const emotionScore = targetEmotion ? Math.min(1, similarity * 0.7 + normalizedConfidence * 0.3) : similarity

    const pronunciationScore = Math.round(
      similarity * 60 +
      normalizedConfidence * 25 +
      emotionScore * 15
    )

    const evaluation = {
      transcript,
      targetText,
      similarity: Math.round(similarity * 100) / 100,
      isCorrect: similarity >= 0.8,
      score: Math.min(100, pronunciationScore),
      feedback: generateDetailedFeedback(similarity, targetText, transcript, emotionScore),
      emotionMatch: emotionScore >= 0.7 ? 'high' : emotionScore >= 0.4 ? 'medium' : 'low' as const,
      timing: similarity >= 0.8 ? 'perfect' : similarity >= 0.6 ? 'slight_offset' : 'off' as const,
      confidence: Math.round(normalizedConfidence * 100) / 100
    }

    log.info('pronunciation_eval_complete', {
      userId,
      durationMs: Date.now() - startTime,
      metadata: { similarity: evaluation.similarity, score: evaluation.score, isCorrect: evaluation.isCorrect }
    })

    return jsonResponse({
      success: true,
      evaluation
    }, 200, rateLimitHeaders(rateLimit.remaining, 0))

  } catch (error: any) {
    log.error('pronunciation_eval_failed', { error: error.message, durationMs: Date.now() - startTime })
    return errorResponse(error.message)
  }
})
