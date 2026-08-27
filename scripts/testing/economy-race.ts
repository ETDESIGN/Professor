// Economy race invariants (FIXPLAN H2): verifies the deployed atomic RPCs
// against the cloud DB as the signed-in fixture student.
//
//  1. two concurrent claim_quest_reward(p_quest_id) on the same quest
//     -> exactly one returns a rewards row, and the reward is credited once
//  2. buy_shop_item(p_item_id) with insufficient gems -> 'insufficient',
//     balance unchanged
//  3. spend_gems(p_amount > balance) -> false, balance unchanged
//
// Usage:
//   FIXTURE_EMAIL=... FIXTURE_PASSWORD=... npx tsx scripts/testing/economy-race.ts
//
// Exit codes: 0 = all checks PASS (SKIPPED allowed), 1 = invariant violation,
// 2 = setup/environment error.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.FIXTURE_EMAIL;
const password = process.env.FIXTURE_PASSWORD;
if (!url || !anon) { console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (repo-root .env).'); process.exit(2); }
if (!email || !password) { console.error('Missing FIXTURE_EMAIL / FIXTURE_PASSWORD env vars — the controller provides them at run time.'); process.exit(2); }

const sb = createClient(url, anon, { auth: { persistSession: false } });

type Status = 'PASS' | 'FAIL' | 'SKIPPED';
const results: Array<{ check: string; status: Status; detail: string }> = [];

async function readProgress(): Promise<{ gems: number; xp: number; total_xp: number } | null> {
  const { data, error } = await sb.from('student_progress').select('gems,xp,total_xp_earned').single();
  if (error || !data) return null;
  return { gems: data.gems ?? 0, xp: data.xp ?? 0, total_xp: data.total_xp_earned ?? 0 };
}

async function main() {
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr || !authData?.user) { console.error('sign-in failed:', authErr?.message); process.exit(2); }
  const studentId = authData.user.id;
  console.log(`signed in fixture student ${studentId}`);

  // Ensure the progress row exists (adds 1 gem; harmless for a fixture).
  await sb.rpc('award_gems', { p_amount: 1 });
  const progress = await readProgress();
  if (!progress) { console.error('could not read student_progress after award_gems(1)'); process.exit(2); }
  console.log(`starting balance: gems=${progress.gems} xp=${progress.xp} total_xp_earned=${progress.total_xp}`);

  // ---- Check 1: concurrent claim_quest_reward -> exactly one winner ----
  {
    // Unique quest_type per run (UNIQUE(student_id,quest_type,assigned_date) is
    // not hit) so re-runs never collide with a previously claimed row.
    const questType = `race_check_${Date.now()}`;
    const { data: quest, error: questErr } = await sb.from('student_quests').insert({
      student_id: studentId,
      quest_type: questType,
      title: 'Race check fixture',
      target: 1,
      current: 1, // already complete
      reward_gems: 5,
      reward_xp: 2,
      claimed: false,
      assigned_date: new Date().toISOString().slice(0, 10),
    }).select('id,reward_gems,reward_xp').single();
    if (questErr || !quest) { console.error('quest insert failed:', questErr?.message); process.exit(2); }

    const before = await readProgress();
    const claims = await Promise.all([
      sb.rpc('claim_quest_reward', { p_quest_id: quest.id }),
      sb.rpc('claim_quest_reward', { p_quest_id: quest.id }),
    ]);
    claims.forEach((c, i) => { if (c.error) console.error(`claim #${i + 1} rpc error:`, c.error.message); });
    const winners = claims.filter((c) => !c.error && Array.isArray(c.data) && c.data.length > 0);
    const after = await readProgress();

    let status: Status = 'PASS';
    const problems: string[] = [];
    if (winners.length !== 1) { status = 'FAIL'; problems.push(`winners=${winners.length} (expected 1)`); }
    if (before && after) {
      if (after.gems - before.gems !== quest.reward_gems) { status = 'FAIL'; problems.push(`gems delta ${after.gems - before.gems} != ${quest.reward_gems}`); }
      if (after.xp - before.xp !== quest.reward_xp) { status = 'FAIL'; problems.push(`xp delta ${after.xp - before.xp} != ${quest.reward_xp}`); }
    } else { status = 'FAIL'; problems.push('could not re-read progress'); }
    results.push({
      check: '1. concurrent claim_quest_reward -> exactly one reward',
      status,
      detail: problems.length ? problems.join('; ') : `one winner credited +${quest.reward_xp}xp/+${quest.reward_gems}gems exactly once`,
    });
  }

  // ---- Check 2: buy_shop_item with insufficient gems ----
  {
    const { data: items, error: itemsErr } = await sb.from('shop_items').select('id,name,cost').order('cost', { ascending: false });
    if (itemsErr || !items || items.length === 0) { console.error('shop_items read failed:', itemsErr?.message); process.exit(2); }
    const priciest = items[0];
    const balance = (await readProgress())!.gems;
    if (balance >= priciest.cost) {
      results.push({
        check: '2. buy_shop_item insufficient gems',
        status: 'SKIPPED',
        detail: `fixture balance ${balance} >= priciest item "${priciest.id}" cost ${priciest.cost} — spend the fixture student's gems down and re-run`,
      });
    } else {
      const before = balance;
      const { data: res, error: rpcErr } = await sb.rpc('buy_shop_item', { p_item_id: priciest.id });
      const after = (await readProgress())!.gems;
      const ok = !rpcErr && res === 'insufficient' && after === before;
      results.push({
        check: `2. buy_shop_item("${priciest.id}", cost ${priciest.cost}) with ${before} gems`,
        status: ok ? 'PASS' : 'FAIL',
        detail: ok ? "returned 'insufficient', balance unchanged" : `res=${String(res)} err=${rpcErr?.message ?? 'none'} gems ${before} -> ${after}`,
      });
    }
  }

  // ---- Check 3: spend_gems(amount > balance) ----
  {
    const before = (await readProgress())!.gems;
    const attempt = before + 1000;
    const { data: res, error: rpcErr } = await sb.rpc('spend_gems', { p_amount: attempt });
    const after = (await readProgress())!.gems;
    const ok = !rpcErr && res === false && after === before;
    results.push({
      check: `3. spend_gems(${attempt}) with ${before} gems`,
      status: ok ? 'PASS' : 'FAIL',
      detail: ok ? 'returned false, balance unchanged (never negative)' : `res=${String(res)} err=${rpcErr?.message ?? 'none'} gems ${before} -> ${after}`,
    });
  }

  console.table(results);
  const failed = results.some((r) => r.status === 'FAIL');
  console.log(failed ? '✗ Economy race invariants VIOLATED.' : '✓ Economy race invariants hold.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
