// Generate the exercise pool for the batch fixture unit (invokes the deployed
// generate-exercises edge function as the fixture teacher, exactly like the
// UnitContentVault does). Run AFTER --setup.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

try { process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env')); } catch { /* already set */ }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const s = JSON.parse(fs.readFileSync('/tmp/games-v3-batch.json', 'utf-8'));

const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const { error: signInError } = await supabase.auth.signInWithPassword({ email: s.email, password: s.password });
if (signInError) { console.error('signin failed:', signInError.message); process.exit(1); }

const { data, error } = await supabase.functions.invoke('generate-exercises', { body: { unitId: s.unitId } });
if (error) { console.error('generate-exercises failed:', error.message ?? JSON.stringify(error).slice(0, 300)); process.exit(1); }

const { count: poolCount, error: cErr } = await supabase.from('pool_items').select('id', { count: 'exact', head: true }).eq('unit_id', s.unitId);
const { count: objCount } = await supabase.from('objectives').select('id', { count: 'exact', head: true }).eq('unit_id', s.unitId);
console.log(`POOL OK — response: ${JSON.stringify(data).slice(0, 160)}… | pool_items: ${poolCount} | objectives: ${objCount}`);
