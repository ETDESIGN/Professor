import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { stripReasoning } from '../_shared/json.ts';
import { fetchChatCompletion, lastChainError } from '../_shared/ai.ts';
import { resolveImageDataUrl } from '../_shared/imageInput.ts';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';
import {
  EXTRACTOR_VERSION,
  STRUCTURE_TYPES,
  verifyStructures,
  type RawStructure,
  type StructureType,
} from '../_shared/bookScan.ts';
import { INVENTORY_PROMPT, buildStructureExtractionPrompt } from '../_shared/prompts/bookScan.ts';

// Two-stage book-fidelity scan (FIXPLAN_F P1.4, doc 10 §4):
//   [1] structure inventory — which structures are present, and where
//   [2] per-structure verbatim extraction — word-for-word content
//   [3] deterministic verification — shape/box/required-field flags
// Results persist to book_pages + page_structures (server-side, service
// role). units.scanned_assets is never touched — the legacy extract-page
// pipeline stays intact until P4.

const STAGE2_CHUNK = 5; // structures per extraction call when chunking

/**
 * Parse the FIRST complete JSON object from model output. Vision models
 * occasionally emit two concatenated objects (or trailing prose after the
 * braces); extractJsonObject returns the raw span and JSON.parse then trips
 * over the trailing junk. Walking balanced braces from the first '{' is
 * robust to both.
 */
function parseFirstJsonObject(s: string): any {
  const t = s.trim();
  const start = t.indexOf('{');
  if (start === -1) throw new Error('no JSON object in output');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1));
    }
  }
  throw new Error('no complete JSON object in output');
}

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'scan-page',
    requireAuth: true,
    rateLimit: { maxRequests: 10, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'unitId', required: true, type: 'string', minLength: 10 },
      { field: 'fileUrl', required: false, type: 'string', minLength: 10 },
      { field: 'imageBase64', required: false, type: 'string', minLength: 100 },
      { field: 'filename', required: false, type: 'string' },
      { field: 'pdfPageNumber', required: false, type: 'number' },
      { field: 'uploadOrder', required: false, type: 'number' },
      { field: 'width', required: false, type: 'number' },
      { field: 'height', required: false, type: 'number' },
      {
        custom: (_value: any, body: any) => {
          if (!body.fileUrl && !body.imageBase64) {
            return 'One of fileUrl or imageBase64 is required';
          }
          return null;
        },
      },
    ],
  }, async (body, auth) => {
    const { unitId, fileUrl, imageBase64, filename, pdfPageNumber, uploadOrder, width, height } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const aiApiKey = Deno.env.get('AI_API_KEY');
    if (!aiApiKey) {
      return { success: false, error: 'Scanning is not configured (missing AI_API_KEY). Please contact the administrator.' };
    }
    if (!supabaseUrl || !serviceKey) {
      return { success: false, error: 'Scanning is not configured (missing service credentials).' };
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ── Ownership (strict, shared policy) ─────────────────────────────────
    const { data: unit, error: unitErr } = await sb
      .from('units')
      .select('id, teacher_id, book_id')
      .eq('id', unitId)
      .single();
    if (unitErr || !unit) {
      return { success: false, error: 'Unit not found.' };
    }
    const ownership = assertUnitOwnership(unit.teacher_id, { callerId: auth?.userId, callerRole: auth?.role });
    if (!ownership.ok) {
      return { success: false, error: ownership.reason || 'You do not own this unit.' };
    }

    // storage_path from a materials public URL, else '(inline)' for direct
    // base64 uploads (the P2 frontend always uploads to storage first).
    const pathMatch = fileUrl?.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    const storagePath = pathMatch ? pathMatch[1] : '(inline)';

    // ── Page row first (status 'scanning') so failures are recorded ───────
    const { data: pageRow, error: pageErr } = await sb
      .from('book_pages')
      .insert({
        teacher_id: unit.teacher_id,
        book_id: unit.book_id,
        unit_id: unitId,
        storage_path: storagePath,
        public_url: fileUrl || '',
        original_filename: filename || null,
        pdf_page_number: typeof pdfPageNumber === 'number' ? pdfPageNumber : null,
        upload_order: typeof uploadOrder === 'number' ? uploadOrder : 0,
        width: typeof width === 'number' ? width : null,
        height: typeof height === 'number' ? height : null,
        status: 'scanning',
        extractor_version: EXTRACTOR_VERSION,
      })
      .select('id')
      .single();
    if (pageErr || !pageRow) {
      return { success: false, error: 'Could not create the page record.' };
    }
    const pageId = pageRow.id;

    const failPage = async (error: string) => {
      // Best-effort status write — a failure here must not mask the original
      // error with a 500 (the runner/teacher retry path depends on the
      // honest success:false response).
      await sb.from('book_pages').update({ status: 'failed', error }).eq('id', pageId)
        .then(() => undefined, (e: any) => console.warn('scan-page: failure-status write failed:', e?.message || e));
      return { success: false, pageId, error };
    };

    // ── BACKGROUND SCAN (audit fix 2026-08-26) ─────────────────────────────
    // A dense page's scan legitimately runs minutes (parallel chunks ×
    // model-fallback chains) — past the edge HTTP wall clock, which left
    // four of the owner's five same-image retries stuck in 'scanning'. The
    // HTTP call returns immediately below; the heavy work continues in
    // EdgeRuntime.waitUntil, progress lives in the DB (book_pages.status),
    // and clients poll the page row.
    const background = (async () => {
      try {
        const image = await resolveImageDataUrl({ imageBase64, url: fileUrl });
        if (!image.finalUrl) throw new Error('No readable image was provided.');

    // ── REGION-SAFE vision chain (same as extract-page) ───────────────────
    const models = [
      Deno.env.get('VISION_MODEL_NAME') || 'qwen/qwen3-vl-235b-a22b-instruct',
      Deno.env.get('FALLBACK_VISION_MODEL_NAME') || 'qwen/qwen2.5-vl-72b-instruct',
      'qwen/qwen3-vl-32b-instruct',
    ];
    // AUDIT FIX (2026-08-28): a dashboard secret accidentally set the vision
    // fallback to the STT omni model (nvidia/nemotron…:free) — a model that
    // ANSWERS (HTTP 200) with reasoning prose instead of JSON, so it "won"
    // the chain and starved the good models ("no JSON object in output").
    // This hardcoded, env-independent net is tried whenever the configured
    // chain's output fails to parse — a bad-but-responsive model can never
    // poison extraction again.
    const VERIFIED_VISION_MODELS = ['qwen/qwen2.5-vl-72b-instruct', 'qwen/qwen3-vl-32b-instruct'];

    // AUDIT 2026-08-28: surface WHY models fail (credits/rate-limit/dead
    // model) — fetchChatCompletion only console.warns, which is invisible
    // from the Management API. Collected per call, included in failures.
    let lastModelErrors: string[] = [];
    const visionCall = async (systemPrompt: string, userText: string, maxTokens: number, stage: string, modelsOverride?: string[]) => {
      const result = await fetchChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: image.finalUrl } },
          ] } as any,
        ],
        { temperature: 0.1, maxTokens, timeoutMs: 45000, models: modelsOverride || models },
      );
      if (result?.usage) {
        await sb.from('llm_telemetry').insert({
          unit_id: unitId,
          function_name: `scan-page:${stage}`,
          model_used: result.model,
          prompt_tokens: result.usage.prompt_tokens || 0,
          completion_tokens: result.usage.completion_tokens || 0,
          total_tokens: result.usage.total_tokens || 0,
        });
      }
      if (result?.content) return stripReasoning(result.content);
      lastModelErrors.push(`${stage}: ${lastChainError().slice(0, 300)}`);
      return '';
    };

    // ── Stage 1: structure inventory ──────────────────────────────────────
    let inventoryRaw: any = null;
    try {
      let invContent = await visionCall(INVENTORY_PROMPT.systemPrompt, INVENTORY_PROMPT.userPromptTemplate, 2500, 'inventory');
      try {
        inventoryRaw = parseFirstJsonObject(invContent);
      } catch {
        // Configured chain produced unparseable output — one retry on the
        // verified vision net (audit 2026-08-28: misconfigured env model).
        invContent = await visionCall(INVENTORY_PROMPT.systemPrompt, INVENTORY_PROMPT.userPromptTemplate, 2500, 'inventory', VERIFIED_VISION_MODELS);
        inventoryRaw = parseFirstJsonObject(invContent);
      }
    } catch (e: any) {
      return await failPage(`Structure inventory failed: ${e?.message || e}. ${lastModelErrors.join(' | ')}. Please retry this page.`);
    }
    if (!inventoryRaw || !Array.isArray(inventoryRaw.structures)) {
      return await failPage('Structure inventory returned an unexpected shape. Please retry this page.');
    }

    const validTypes = new Set<string>(STRUCTURE_TYPES);
    // The inventory schema asks for "type"; tolerate "structure_type" too so
    // a key drift in model output doesn't silently drop detections.
    const detected: { type: StructureType; bbox: unknown; confidence?: number; hint?: string }[] =
      (inventoryRaw.structures as any[])
        .filter((s) => {
          const t = s?.structure_type ?? s?.type;
          return typeof t === 'string' && validTypes.has(t);
        })
        .map((s) => ({
          type: (s.structure_type ?? s.type) as StructureType,
          bbox: s.bbox,
          confidence: typeof s.confidence === 'number' ? s.confidence : undefined,
          hint: typeof s.hint === 'string' ? s.hint : undefined,
        }));

    // Absence = absence: an empty inventory is a VALID scan result (e.g. a
    // purely decorative page). Persist and return — never invent.
    if (detected.length === 0) {
      const { error: updErr } = await sb.from('book_pages').update({
        status: 'scanned',
        inventory: inventoryRaw,
        printed_page_number: inventoryRaw.page_labels?.printed_page_number || null,
        printed_unit_label: inventoryRaw.page_labels?.printed_unit_label || null,
        printed_title: inventoryRaw.page_labels?.printed_title || null,
      }).eq('id', pageId);
      if (updErr) return await failPage(`Could not save the scan: ${updErr.message}`);
      return {
        success: true,
        pageId,
        extractorVersion: EXTRACTOR_VERSION,
        page_labels: inventoryRaw.page_labels || {},
        structures: [],
        note: 'No pedagogical structures detected on this page.',
      };
    }

    // ── Stage 2: per-structure verbatim extraction (chunked) ──────────────
    const detectedTypes = [...new Set(detected.map((d) => d.type))];
    const extractionPrompt = buildStructureExtractionPrompt(detectedTypes);

    const chunks: typeof detected[] = [];
    for (let i = 0; i < detected.length; i += STAGE2_CHUNK) chunks.push(detected.slice(i, i + STAGE2_CHUNK));

    // Chunks are independent — run them concurrently so wall-clock stays
    // ~one vision call regardless of how many structures the page holds
    // (the sequential version blew the edge limit on dense pages).
    const chunkResults = await Promise.all(chunks.map(async (chunk) => {
      const chunkInventory = JSON.stringify(chunk.map((c, i) => ({ structure_type: c.type, bbox: c.bbox, confidence: c.confidence, hint: c.hint, order_index: i })));
      // Parse-aware retry with chain ROTATION: attempt 0 uses the configured
      // chain; if its output doesn't parse (e.g. a misconfigured env model
      // answers with reasoning prose — audit 2026-08-28), attempt 1 runs the
      // verified vision net instead of repeating the same poisoned chain.
      let lastErr = 'unknown error';
      const chains: (string[] | undefined)[] = [undefined, VERIFIED_VISION_MODELS];
      for (const chainOverride of chains) {
        try {
          const content = await visionCall(
            extractionPrompt.systemPrompt,
            extractionPrompt.userPromptTemplate.replace('{{inventoryJson}}', chunkInventory),
            8000,
            'extract',
            chainOverride,
          );
          return { ok: true as const, parsed: parseFirstJsonObject(content) };
        } catch (e: any) {
          lastErr = e?.message || String(e);
        }
      }
      // Low-credits adaptation (audit 2026-08-28): OpenRouter rejects the
      // WHOLE request with 402 when max_tokens exceeds the remaining balance
      // ("can only afford N tokens"). Retry with the affordable cap — a
      // smaller-budget extraction beats a dead one, and the balance recovers
      // when the owner tops up.
      const afford = /can only afford (\d+)/.exec(lastChainError());
      if (afford) {
        const budget = Math.max(500, parseInt(afford[1], 10) - 100);
        try {
          const content = await visionCall(
            extractionPrompt.systemPrompt,
            extractionPrompt.userPromptTemplate.replace('{{inventoryJson}}', chunkInventory),
            budget,
            'extract',
            VERIFIED_VISION_MODELS,
          );
          return { ok: true as const, parsed: parseFirstJsonObject(content) };
        } catch (e: any) {
          lastErr = `low-credit retry (${budget} tokens) also failed: ${e?.message || String(e)}`;
        }
      }
      return { ok: false as const, error: lastErr };
    }));

    const rawStructures: RawStructure[] = [];
    for (const res of chunkResults) {
      if (!res.ok) {
        return await failPage(`Verbatim extraction failed: ${res.error}. ${lastModelErrors.join(' | ')}. Please retry this page.`);
      }
      const arr = Array.isArray(res.parsed?.structures) ? res.parsed.structures : [];
      for (const s of arr) {
        rawStructures.push({
          structure_type: s?.structure_type ?? s?.type,
          order_index: typeof s?.order_index === 'number' ? s.order_index + rawStructures.length : rawStructures.length,
          bbox: s?.bbox,
          confidence: typeof s?.confidence === 'number' ? s.confidence : undefined,
          set_label: typeof s?.set_label === 'string' ? s.set_label : undefined,
          data: s?.data,
        });
      }
    }

    // ── Stage 3: deterministic verification ───────────────────────────────
    const verified = verifyStructures(rawStructures);

    // ── Persist ────────────────────────────────────────────────────────────
    const { error: updErr } = await sb.from('book_pages').update({
      status: 'scanned',
      inventory: inventoryRaw,
      printed_page_number: inventoryRaw.page_labels?.printed_page_number || null,
      printed_unit_label: inventoryRaw.page_labels?.printed_unit_label || null,
      printed_title: inventoryRaw.page_labels?.printed_title || null,
    }).eq('id', pageId);
    if (updErr) return await failPage(`Could not save the scan: ${updErr.message}`);

    if (verified.length > 0) {
      const rows = verified.map((v) => ({
        page_id: pageId,
        structure_type: v.structure_type,
        order_index: v.order_index,
        bbox: v.bbox,
        confidence: v.confidence,
        verification_flags: v.verification_flags,
        data: v.data,
        set_label: v.set_label,
        grammar_tier: v.grammar_tier,
        source: 'ai',
        extractor_version: EXTRACTOR_VERSION,
      }));
      const { error: structErr } = await sb.from('page_structures').insert(rows);
      if (structErr) return await failPage(`Could not save structures: ${structErr.message}`);
    }

    console.log(`scan-page: page ${pageId} scanned — ${verified.length} structures`);

      } catch (e: any) {
        await failPage(e?.message || String(e));
      }
    })();
    // @ts-ignore EdgeRuntime is a global in Supabase edge functions
    EdgeRuntime.waitUntil(background);

    // Immediate response — the scan continues in the background and the
    // page row records its progress/result.
    return {
      success: true,
      pageId,
      status: 'scanning',
      note: 'Scan running in the background. Poll the page record (book_pages.status) for the result.',
    };
  });
});
