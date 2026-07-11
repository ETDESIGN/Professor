// Shared OpenRouter chat-completion helper (region-safe: OpenRouter only — no
// direct Google/OpenAI/Anthropic).
//
// EVERY AI-calling edge function must route through fetchChatCompletion() so a
// slow or hung model can never stall the invocation past Supabase's wall-clock
// limit — the root cause of HTTP 546. It provides:
//   * a BOUNDED per-model timeout (AbortSignal) — no more indefinite hangs;
//   * a capped max_tokens (reasoning models were generating 25k tokens, far too
//     slow) — pass a smaller maxTokens for compact JSON payloads;
//   * automatic model fallback.

export interface ChatMessage {
  role: string;
  // string, OR an array for vision (e.g. [{type:'text',text:...},{type:'image_url',...}]).
  content: any;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage?: any;
}

export function defaultModels(): string[] {
  return [
    Deno.env.get('AI_MODEL_NAME') || 'moonshotai/kimi-k2.6',
    Deno.env.get('FALLBACK_MODEL_NAME') || 'qwen/qwen3-235b-a22b',
  ];
}

export interface FetchChatOpts {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  models?: string[];
}

/**
 * Call the OpenRouter chat endpoint with model fallback + a bounded timeout.
 * Returns the first successful response's content/model/usage, or null when no
 * model succeeds (key missing, all timed out, all errored). Never throws.
 */
export async function fetchChatCompletion(
  messages: ChatMessage[],
  opts: FetchChatOpts = {},
): Promise<ChatCompletionResult | null> {
  const apiKey = Deno.env.get('AI_API_KEY');
  const baseUrl = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';
  if (!apiKey) return null;

  const temperature = opts.temperature ?? 0.4;
  const maxTokens = opts.maxTokens ?? 6000;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const models = opts.models && opts.models.length ? opts.models : defaultModels();

  let lastError = '';
  for (const modelName of models) {
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ model: modelName, messages, temperature, max_tokens: maxTokens }),
      });
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        lastError = `${modelName} HTTP ${resp.status}: ${errBody.slice(0, 160)}`;
        continue;
      }
      const data = await resp.json();
      if (data.error) {
        lastError = `${modelName} API error: ${JSON.stringify(data.error).slice(0, 160)}`;
        continue;
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        lastError = `${modelName} returned empty content`;
        continue;
      }
      // A text model given an image returns HTTP 200 with an "I can't read
      // images" message — treat that as a FAILURE so we fall through to the next
      // (hopefully vision-capable) model instead of returning a useless answer.
      const low = String(content).toLowerCase();
      if (low.includes('does not support image') || low.includes("can't process images") || low.includes('cannot read') && low.includes('image')) {
        lastError = `${modelName} does not support image input`;
        continue;
      }
      return { content: String(content), model: data.model || modelName, usage: data.usage };
    } catch (err: any) {
      // AbortError (timeout) or network failure -> try next model.
      lastError = `${modelName} threw: ${err?.name === 'TimeoutError' ? 'timeout' : (err?.message || String(err))}`;
    }
  }
  console.warn(`fetchChatCompletion: all models failed. lastError=${lastError}`);
  return null;
}

/**
 * Convenience: ask the fallback model to repair broken JSON. Bounded timeout.
 */
export async function healJson(
  broken: string,
  timeoutMs = 25000,
): Promise<string | null> {
  const healerModel = Deno.env.get('FALLBACK_MODEL_NAME') || 'qwen/qwen3-235b-a22b';
  const result = await fetchChatCompletion(
    [
      { role: 'system', content: 'You are a JSON parser repair agent. Return ONLY the fully corrected, strictly valid JSON. Do NOT emit markdown backticks or commentary.' },
      { role: 'user', content: `Repair this broken JSON:\n${broken}` },
    ],
    { temperature: 0.1, maxTokens: 6000, timeoutMs, models: [healerModel] },
  );
  return result?.content || null;
}
