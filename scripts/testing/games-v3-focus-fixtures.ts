// Switch the fixture unit's slide to FOCUS_CARDS with cards built from the fixture vocab.
import fs from 'node:fs';
process.loadEnvFile('/Users/ET/Documents/DEV/teacher app/professor-0.1 (1)/.env');
const PAT = process.env.SUPABASE_ACCESS_TOKEN!;
const { unitId } = JSON.parse(fs.readFileSync('/tmp/games-v3-fixtures.json', 'utf-8'));

async function sql(query: string) {
  const res = await fetch('https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const b = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(b).slice(0, 300));
  return b;
}
async function main() {
  const words = ['tractor', 'leaf', 'rock', 'river', 'apple', 'garden'];
  const cards = words.map((w, i) => ({ front: w, image: `https://picsum.photos/seed/${w}/400/300`, order: i }));
  const block = { id: crypto.randomUUID(), type: 'FOCUS_CARDS', title: 'Focus Cards', phase: 'INPUT', data: { cards } };
  const blockJson = JSON.stringify([block]).replace(/'/g, "''");
  await sql(`UPDATE public.units SET flow = flow || '${blockJson}'::jsonb WHERE id = '${unitId}'`);
  const rows = await sql(`SELECT jsonb_array_length(flow) AS n FROM public.units WHERE id = '${unitId}'`);
  await sql(`UPDATE public.classroom_sessions SET current_index = ${Number(rows[0].n) - 1}, updated_at = now() WHERE unit_id = '${unitId}'`);
  console.log('FOCUS_CARDS slide appended, current_index =', Number(rows[0].n) - 1);
}
main();
