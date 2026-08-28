// supabase/functions/evaluate-dubbing/index.ts
// LLM-as-judge dubbing evaluator: per-line bag-of-words F1 + lenient bands,
// optionally refined by a region-safe chat model. Audio, when supplied, is
// transcribed via the region-safe _shared/stt.ts provider chain only.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { bandFor, compareWords } from './score.ts';
import { transcribe } from '../_shared/stt.ts';
import { fetchChatCompletion } from '../_shared/ai.ts';

const FEEDBACK: Record<string, string> = {
  great: '🌟 Amazing! You sounded just like the movie!',
  almost: '🙂 So close! Listen once more and try again.',
  try_again: '↻ Good try! Take a big breath and give it another go.',
};

/** Models sometimes wrap JSON in markdown fences — strip before JSON.parse. */
function parseJudgeJson(raw: string): { wordMatch?: unknown; feedback?: unknown } | null {
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

serve(async (req) =>
  serveEdgeFunction(req, {
    name: 'evaluate-dubbing',
    requireAuth: true,
    rateLimit: { maxRequests: 30, windowMs: 60_000 },
    validationRules: [
      {
        custom: (_value: any, body: any) => {
          if (!Array.isArray(body?.lines) || body.lines.length === 0 || body.lines.length > 30) {
            return 'lines must be a non-empty array of at most 30 items';
          }
          return null;
        },
      },
    ],
  }, async (body, _auth) => {
    const { lines, language = 'en' } = body as {
      lines: { lineId: string; text: string; transcript?: string; audioBase64?: string; audioFormat?: string }[];
      language?: string;
    };
    const results: Record<string, { band: string; wordMatch: number; transcript: string; feedback: string; method: string }> = {};

    for (const line of lines) {
      let transcript = line.transcript ?? '';
      let method = line.transcript ? 'client_transcript' : 'none';
      if (!transcript && line.audioBase64) {
        const stt = await transcribe(line.audioBase64, language, line.audioFormat || 'webm');
        if (stt && stt.transcript.trim()) {
          transcript = stt.transcript.trim();
          method = 'stt';
        }
      }

      let wordMatch = compareWords(line.text, transcript);
      let feedback = FEEDBACK[bandFor(wordMatch)];

      // LLM pass: catch near-misses the bag-of-words misses (plurals,
      // contractions) + generate an encouraging, kid-friendly line. Never
      // throws; on failure the heuristic result above stands.
      // Skipped on an empty transcript (no client transcript, no STT result):
      // comparing silence to the reference can only hallucinate a score —
      // "blank" must never be judged, let alone raised to 'great'.
      const judge = transcript
        ? await fetchChatCompletion(
            [
              {
                role: 'system',
                content:
                  'You are a kind children\'s English teacher. Compare the student transcript to the reference line. Reply ONLY JSON, no markdown: {"wordMatch": <number 0-1>, "feedback": "<one short encouraging sentence, max 12 words>"}',
              },
              { role: 'user', content: JSON.stringify({ reference: line.text, transcript }) },
            ],
            { temperature: 0.2, maxTokens: 300, timeoutMs: 20_000 },
          )
        : null;
      if (judge) {
        const parsed = parseJudgeJson(judge.content);
        if (parsed) {
          if (typeof parsed.wordMatch === 'number' && Number.isFinite(parsed.wordMatch)) {
            // Lenient: the judge can only raise the heuristic score, never lower it.
            wordMatch = Math.max(wordMatch, Math.min(1, Math.max(0, parsed.wordMatch)));
          }
          if (typeof parsed.feedback === 'string' && parsed.feedback.length > 0 && parsed.feedback.length <= 80) {
            feedback = parsed.feedback;
          }
          method += '+llm_judge';
        }
      }

      const band = bandFor(wordMatch);
      results[line.lineId] = {
        band,
        wordMatch: Math.round(wordMatch * 100) / 100,
        transcript,
        feedback,
        method,
      };
    }

    const bands = Object.values(results).map((r) => r.band);
    // Null when nothing was evaluated (empty lines array): [].every() is
    // vacuously true and would hand back 'great' for a blank take — persist
    // null instead (UI: "Score pending"; column is nullable).
    const overallBand = bands.length === 0 ? null
      : bands.every((b) => b === 'great')
      ? 'great'
      : bands.some((b) => b === 'try_again')
      ? 'try_again'
      : 'almost';

    return { success: true, results, overallBand };
  })
);
