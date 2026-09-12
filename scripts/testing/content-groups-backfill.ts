// content-groups-backfill — fleet-wide seeding + naming + pool re-stamping
// (spec 2026-09-13 docs/superpowers/specs/2026-09-13-content-groups-and-plan-library-design.md).
//
// For every unit with scanned+confirmed pages (or --unit for one):
//   1. seed_unit_content_groups (idempotent RPC — vocab by label, stories by
//      title, comic/song per structure)
//   2. AI-name groups still carrying seed titles (one batched region-safe call
//      per unit — same prompt as enrich-unit)
//   3. optionally re-run generate-exercises so pool items carry
//      content.group_id / set_label (--restamp)
//
// DRY RUN by default; --yes executes. Naming needs AI_API_KEY; without it the
// script still seeds (titles stay printed labels).
//
// Usage:
//   npx tsx scripts/testing/content-groups-backfill.ts [--unit <id>] [--restamp] [--yes]
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_API_KEY (optional)
import { createClient } from '@supabase/supabase-js';
import { buildGroupNamingPrompt, pickGroupNames, type GroupNamingInput } from '../../supabase/functions/_shared/contentGroups';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsdnzijketjnzhakqtit.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AI_KEY = process.env.AI_API_KEY;
const MODELS = [process.env.AI_MODEL_NAME || 'moonshotai/kimi-k2.6', process.env.FALLBACK_MODEL_NAME || 'qwen/qwen3-235b-a22b'];

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}
const EXEC = process.argv.includes('--yes');
const RESTAMP = process.argv.includes('--restamp');
const unitArg = process.argv.includes('--unit') ? process.argv[process.argv.indexOf('--unit') + 1] : null;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function callAI(sys: string, usr: string): Promise<any> {
  for (const model of MODELS) {
    try {
      const res = await fetch(`${process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AI_KEY}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], temperature: 0.3, max_tokens: 2000 }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text: string = data.choices?.[0]?.message?.content || '';
      const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      return JSON.parse(jsonText);
    } catch { /* next model */ }
  }
  return null;
}

async function nameGroups(unitId: string): Promise<number> {
  if (!AI_KEY) return 0;
  const { data: groups } = await sb
    .from('unit_content_groups')
    .select('id, kind, title, title_source, structure_ids')
    .eq('unit_id', unitId)
    .order('order_index');
  const unnamed = (groups || []).filter((g: any) => g.title_source === 'seed' && g.kind !== 'song');
  if (unnamed.length === 0) return 0;

  // member context: words per structure + passage/comic excerpts
  const { data: vocab } = await sb.from('vocabulary_items').select('word, source_structure_id').eq('unit_id', unitId);
  const { data: passages } = await sb
    .from('page_structures')
    .select('id, structure_type, data')
    .eq('book_pages.unit_id', unitId)
    .in('structure_type', ['reading_passage', 'clil_passage', 'comic']);
  const wordsBySid = new Map<string, string[]>();
  for (const v of (vocab || []) as any[]) {
    if (!v?.source_structure_id || !v?.word) continue;
    const k = String(v.source_structure_id);
    const list = wordsBySid.get(k) || [];
    list.push(String(v.word));
    wordsBySid.set(k, list);
  }
  const inputs: GroupNamingInput[] = unnamed.map((g: any) => {
    const sids = new Set((g.structure_ids || []).map(String));
    const d = (passages || []).find((p: any) => sids.has(String(p.id)));
    const data = d?.data || {};
    const excerpt = [
      data.title ? String(data.title) : '',
      data.passage_text ? String(data.passage_text).slice(0, 200) : '',
      Array.isArray(data.panels) ? data.panels.slice(0, 3).map((p: any) => [p?.narration, p?.bubbles?.[0]?.text].filter(Boolean).join(' ')).join(' / ') : '',
    ].filter(Boolean).join('. ');
    return {
      id: String(g.id),
      kind: g.kind,
      printed_label: g.title,
      words: g.kind === 'vocab_series' ? ([...new Set((g.structure_ids || []).flatMap((sid: string) => wordsBySid.get(String(sid)) || []))] as string[]) : undefined,
      excerpt: excerpt || undefined,
    };
  });
  const prompt = buildGroupNamingPrompt(inputs);
  const res = await callAI(prompt.sys, prompt.usr);
  const names = pickGroupNames(res, new Set(inputs.map((i) => i.id)));
  for (const [id, title] of names) {
    const r = await sb.from('unit_content_groups').update({ title, title_source: 'ai', updated_at: new Date().toISOString() }).eq('id', id);
    if (r.error) console.warn(`  naming update failed ${id}: ${r.error.message}`);
  }
  return names.size;
}

async function main() {
  // Units with confirmed basket content (baskets_confirmed_at) — those can seed.
  let unitIds: string[] = [];
  if (unitArg) {
    unitIds = [unitArg];
  } else {
    const { data: rows } = await sb
      .from('units')
      .select('id, title')
      .not('baskets_confirmed_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);
    unitIds = (rows || []).map((r: any) => r.id);
  }
  console.log(`[content-groups-backfill] ${unitIds.length} unit(s) · ${EXEC ? 'EXECUTE' : 'DRY RUN'}${RESTAMP ? ' · restamp pools' : ''}`);

  let seeded = 0, namedTotal = 0, restamped = 0;
  for (const unitId of unitIds) {
    const seed = await sb.rpc('seed_unit_content_groups', { p_unit_id: unitId });
    if (seed.error) {
      console.warn(`- ${unitId}: seed FAILED ${seed.error.message}`);
      continue;
    }
    const res = seed.data && typeof seed.data === 'object' ? seed.data : {};
    const n = Array.isArray(res.groups) ? res.groups.length : 0;
    if (n === 0) continue;
    seeded++;
    let named = 0;
    if (EXEC) {
      named = await nameGroups(unitId);
      namedTotal += named;
    }
    let restampNote = '';
    if (EXEC && RESTAMP) {
      const { data: inv } = await sb.functions.invoke('generate-exercises', { body: { unitId } });
      restampNote = inv?.success ? ` · pool restamped (${inv.poolItems ?? '?'} items)` : ` · RESTAMP FAILED ${inv?.error ?? ''}`;
      if (inv?.success) restamped++;
    }
    console.log(`- ${unitId}: ${n} groups${named ? ` · ${named} named` : ''}${restampNote}`);
  }
  console.log(`Done: ${seeded}/${unitIds.length} units seeded, ${namedTotal} groups AI-named${RESTAMP ? `, ${restamped} pools restamped` : ''}.`);
  if (!EXEC) console.log('Dry run only — re-run with --yes to name + restamp.');
}

main().catch((e) => { console.error(e); process.exit(1); });
