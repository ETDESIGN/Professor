// Flip the fixture unit's WORD_SEARCH block to rounds:1 (for the final-screen pass).
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
  await sql(`UPDATE public.units SET flow = jsonb_set(flow, '{1,data,rounds}', '1'::jsonb) WHERE id = '${unitId}'`);
  console.log('rounds=1 set');
}
main();
