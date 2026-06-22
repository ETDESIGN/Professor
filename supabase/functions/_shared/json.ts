// Shared JSON utilities for Edge Functions.
//
// Reasoning models served via OpenRouter (kimi, deepseek, qwen) frequently
// emit <think>/<reasoning> blocks or pipe-delimited thinking before the real
// payload, and may wrap JSON in markdown fences. Every AI-consuming edge
// function must normalise through these helpers so parsing is consistent.
//
// Region note: this module performs no network calls and uses no model
// provider; it is safe under the OpenRouter-only API restriction.

/**
 * Remove reasoning/thinking artefacts and markdown code fences from an LLM
 * response so only the intended payload remains.
 */
export function stripReasoning(content: string): string {
  if (!content) return '';

  let out = content;

  // 1. Closed XML-style reasoning blocks: <think>...</think>, <reasoning>...</reasoning>
  out = out.replace(/<(think|reasoning)>[\s\S]*?<\/\1>/gi, '');

  // 2. Unterminated reasoning blocks (model truncated mid-thought) -> drop to end
  out = out.replace(/<(think|reasoning)>[\s\S]*$/gi, '');

  // 3. Pipe-delimited thinking: |begin_thinking|...|end_thinking|
  out = out.replace(/\|begin_thinking\|[\s\S]*?(\|end_thinking\||$)/gi, '');

  // 4. Markdown code fences (```json ... ``` or bare ```)
  out = out.replace(/```(?:json)?/gi, '');

  return out.trim();
}

/**
 * Extract the first top-level JSON object from an LLM response.
 * Returns '{}' when no object is found so callers can JSON.parse safely.
 */
export function extractJsonObject(content: string): string {
  const cleaned = stripReasoning(content);
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : '{}';
}

/**
 * Leniently parse an LLM response into a JSON object. Never throws on missing
 * JSON (returns {}). Callers that need strict failure should inspect the result.
 */
export function parseJsonLenient<T = any>(content: string): T {
  return JSON.parse(extractJsonObject(content)) as T;
}
