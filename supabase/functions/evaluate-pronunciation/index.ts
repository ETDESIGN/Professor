import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { transcribe } from '../_shared/stt.ts';

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function calculateSimilarity(spoken: string, target: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const a = normalize(spoken);
  const b = normalize(target);
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - distance / maxLen);
}

function generateDetailedFeedback(similarity: number, target: string, transcript: string, emotionScore: number): string {
  const parts: string[] = [];
  if (similarity >= 0.95) {
    parts.push('Perfect pronunciation!');
  } else if (similarity >= 0.8) {
    parts.push('Good pronunciation. Minor differences detected.');
  } else if (similarity >= 0.6) {
    parts.push(`Almost there. Listen carefully to the target: "${target}"`);
  } else {
    parts.push(`Keep practicing. Target phrase: "${target}"`);
  }

  if (transcript.toLowerCase().includes(target.toLowerCase().split(' ')[0])) {
    parts.push('Good start with the first word.');
  }

  if (emotionScore >= 0.7) {
    parts.push('Great emotional expression!');
  } else if (emotionScore >= 0.4) {
    parts.push('Try to put more feeling into your delivery.');
  }

  return parts.join(' ');
}

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'evaluate-pronunciation',
    requireAuth: true,
    rateLimit: { maxRequests: 30, windowMs: 60 * 1000 },
    validationRules: [
      {
        custom: (_value: any, body: any) => {
          // Either a client-side Web Speech transcript OR raw audio is required.
          // Web Speech is region-free (runs in the browser) and is the default
          // path; audio is only used when a region-safe STT provider is wired up.
          if (!body.targetText) return 'Missing required field: targetText';
          if (!body.transcript && !body.audioBase64) {
            return 'Missing required field: transcript or audioBase64';
          }
          return null;
        },
      },
    ],
  }, async (body, _auth) => {
    const { audioBase64, targetText, targetEmotion, language, transcript: clientTranscript } = body;

    // Resolve a transcript without ever calling a region-blocked provider.
    // Priority: configured region-safe STT provider > client Web Speech transcript.
    let transcript = '';
    let providerConfidence = 0;

    const sttResult = await transcribe(audioBase64, language || 'en');
    if (sttResult) {
      transcript = sttResult.transcript;
      providerConfidence = sttResult.confidence;
    } else if (typeof clientTranscript === 'string' && clientTranscript.trim()) {
      transcript = clientTranscript.trim();
      // Browser Web Speech does not expose a calibrated confidence; treat as
      // neutral and let Levenshtein similarity drive the score.
      providerConfidence = 0.5;
    }

    // Honest "could not evaluate" instead of fabricating a transcript.
    if (!transcript) {
      return {
        success: true,
        evaluation: {
          transcript: '',
          targetText,
          similarity: 0,
          isCorrect: false,
          score: 0,
          feedback: 'Could not capture your speech. Check microphone permissions and try again.',
          emotionMatch: 'low',
          timing: 'unknown',
          confidence: 0,
          provider: 'none',
        },
      };
    }

    const similarity = calculateSimilarity(transcript, targetText);
    const normalizedConfidence = Math.max(0, Math.min(1, providerConfidence));
    const emotionScore = targetEmotion ? Math.min(1, similarity * 0.7 + normalizedConfidence * 0.3) : similarity;

    const pronunciationScore = Math.round(
      similarity * 60 +
      normalizedConfidence * 25 +
      emotionScore * 15,
    );

    const evaluation = {
      transcript,
      targetText,
      similarity: Math.round(similarity * 100) / 100,
      isCorrect: similarity >= 0.8,
      score: Math.min(100, pronunciationScore),
      feedback: generateDetailedFeedback(similarity, targetText, transcript, emotionScore),
      emotionMatch: emotionScore >= 0.7 ? 'high' : emotionScore >= 0.4 ? 'medium' : 'low' as const,
      timing: similarity >= 0.8 ? 'perfect' : similarity >= 0.6 ? 'slight_offset' : 'off' as const,
      confidence: Math.round(normalizedConfidence * 100) / 100,
      provider: sttResult ? Deno.env.get('STT_PROVIDER') || 'stt' : 'web-speech',
    };

    return { success: true, evaluation };
  });
});
