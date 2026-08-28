// student-passports
// Teacher-minted student/parent accounts ("passports"): printable cards with
// username + password + QR. Possession of the card IS the login (the QR
// encodes the same username/password via {origin}/login#p=<base64url>), which
// is the standard classroom-app model (Seesaw/ClassDojo). A password reset
// instantly invalidates the old card.
//
// Actions (caller must be admin, the class teacher, or an active school
// manager on the class's school — same authority matrix as create_roster_student):
//   create      — mint student and/or parent accounts for a roster student.
//                 roster_id omitted  -> new roster row is created first.
//                 roster_id present   -> existing row; must be unclaimed for a
//                 student account, claimed for a parent-only add-on.
//   get_cards   — decrypt + return card payloads (whole class or one roster)
//                 for reprinting. mark_printed: true stamps last_printed_at.
//   reset       — issue new password(s) (student|parent|both). Old cards die.
//   deactivate  — ban the minted auth users + mark the passport revoked.
//                 Called by the UI right after archive_roster_student.
//
// Credential storage: WebCrypto AES-GCM; the key lives in passport_secrets
// (service-role-only table) and never leaves the server context.

import { serveEdgeFunction } from '../_shared/edgeHandler.ts';

const EMAIL_DOMAIN = '@passport.local';

// Kid-friendly, unambiguous, 3-7 letters. Three words + 2 digits.
const WORDS = [
  'apple', 'apricot', 'arrow', 'atom', 'aurora', 'badger', 'balloon', 'bamboo',
  'banjo', 'beacon', 'beaver', 'bee', 'berry', 'bicycle', 'birch', 'bison',
  'blanket', 'blossom', 'blue', 'bobcat', 'bonfire', 'bonsai', 'boulder', 'brave',
  'breeze', 'bridge', 'bright', 'bubble', 'bugle', 'butter', 'cactus', 'camera',
  'camp', 'candle', 'canoe', 'canyon', 'castle', 'cedar', 'cherry', 'chime',
  'cinder', 'citrus', 'clover', 'cobra', 'comet', 'compass', 'copper', 'coral',
  'cosmic', 'cotton', 'crab', 'crane', 'crayon', 'cricket', 'crystal', 'daisy',
  'dapper', 'dawn', 'deer', 'delta', 'denim', 'diamond', 'dingo', 'dinosaur',
  'dock', 'dolphin', 'donut', 'dragon', 'dream', 'duckling', 'dune', 'eagle',
  'earth', 'echo', 'eclair', 'ember', 'emerald', 'emu', 'engine', 'falcon',
  'fable', 'fern', 'fiddle', 'firefly', 'flamingo', 'flint', 'float',
  'flower', 'forest', 'fountain', 'fox', 'frost', 'galaxy', 'garden', 'gecko',
  'gem', 'gentle', 'ginger', 'glacier', 'glimmer', 'goblin', 'goldfish', 'goose',
  'granite', 'grape', 'grotto', 'guitar', 'gumbo', 'hammock', 'harbor', 'harvest',
  'hazel', 'helmet', 'hickory', 'hollow', 'honey', 'hornet', 'horizon', 'hurdle',
  'igloo', 'indigo', 'island', 'ivory', 'jasmine', 'jelly', 'jigsaw', 'jolly',
  'jubilee', 'juniper', 'kayak', 'kelp', 'kettle', 'keystone', 'kidney', 'kindle',
  'koala', 'lagoon', 'lantern', 'laser', 'lava', 'leafy', 'legend', 'lemon',
  'leopard', 'lighthouse', 'lilac', 'linden', 'lion', 'lizard', 'lobster', 'lotus',
  'lunar', 'lynx', 'magnet', 'mango', 'maple', 'marble', 'marigold', 'marlin',
  'marsh', 'meadow', 'melon', 'meteor', 'midnight', 'mint', 'mirage', 'mochi',
  'mole', 'monsoon', 'moon', 'morse', 'mosaic', 'mountain', 'muffin', 'mulberry',
  'mural', 'mushroom', 'mustard', 'narwhal', 'nectar', 'needle', 'nest', 'nimble',
  'noodle', 'north', 'nugget', 'oasis', 'oatmeal', 'ocean', 'octopus', 'olive',
  'onyx', 'opal', 'orange', 'orchid', 'otter', 'owl', 'paddle', 'palm',
  'panda', 'pancake', 'papaya', 'paprika', 'parsley', 'parrot', 'peach', 'peanut',
  'pebble', 'pelican', 'penguin', 'pepper', 'petal', 'phoenix', 'piano', 'pigment',
  'pilot', 'pinecone', 'pistachio', 'pixel', 'planet', 'platinum', 'plum', 'polaris',
  'pollen', 'pomelo', 'poppy', 'porpoise', 'possum', 'prairie', 'pretzel', 'prism',
  'pumpkin', 'puzzle', 'quaint', 'quartz', 'quaver', 'quill', 'quilt', 'radish',
  'rainbow', 'ranger', 'raspberry', 'raven', 'redwood', 'reef', 'ribbon', 'riddle',
  'ripple', 'river', 'robin', 'rocket', 'rooster', 'rosemary', 'ruby', 'ruffle',
  'saffron', 'sailor', 'salmon', 'samba', 'sandal', 'sapphire', 'satchel', 'scarlet',
  'seagull', 'seashell', 'sequoia', 'shadow', 'sherbet', 'shore', 'shrimp', 'silver',
  'sky', 'smoke', 'snorkel', 'snowdrop', 'sparrow', 'spiral', 'sprout', 'spruce',
  'starling', 'stone', 'strawberry', 'sunfish', 'sunflower', 'sunny', 'sunrise', 'sunset',
  'syrup', 'tabby', 'tangerine', 'tapir', 'tarragon', 'tempo', 'tepee', 'thistle',
  'thunder', 'tiger', 'timber', 'tin', 'tomato', 'topaz', 'torch', 'toucan',
  'trail', 'treasure', 'tulip', 'tumble', 'tundra', 'tunnel', 'turquoise', 'turtle',
  'twilight', 'twig', 'ukulele', 'umbrella', 'urchin', 'valley', 'vanilla', 'velvet',
  'verbena', 'vertex', 'violet', 'violin', 'volcano', 'voyage', 'walnut', 'walrus',
  'wander', 'wasabi', 'waterfall', 'wattle', 'whale', 'wheat', 'willow', 'window',
  'winter', 'wolf', 'wombat', 'waffle', 'yarrow', 'yodel', 'yogurt', 'zebra',
];

function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function generatePassword(): string {
  const w1 = randomWord();
  let w2 = randomWord();
  let w3 = randomWord();
  while (w2 === w1) w2 = randomWord();
  while (w3 === w1 || w3 === w2) w3 = randomWord();
  const digits = String(10 + Math.floor(Math.random() * 90));
  return `${w1}-${w2}-${w3}-${digits}`;
}

/** Lowercase [a-z0-9] username base from a display name; CJK/emoji fall back to 'student'. */
function slugifyBase(name: string): string {
  const slug = (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');         // letters+digits only, no separators
  if (slug.length < 2) return 'student';
  return slug.slice(0, 16);
}

const b64encode = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const b64decode = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

// ---- AES-GCM credential encryption (key stays server-side) ----------------

async function ensurePassportKey(sb: any): Promise<string> {
  const { data } = await sb.from('passport_secrets').select('enc_key').eq('id', 1).maybeSingle();
  if (data?.enc_key) return data.enc_key;

  const key = b64encode(crypto.getRandomValues(new Uint8Array(32)));
  const { error } = await sb.from('passport_secrets').insert({ id: 1, enc_key: key });
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);

  const { data: again } = await sb.from('passport_secrets').select('enc_key').eq('id', 1).maybeSingle();
  if (!again?.enc_key) throw new Error('Passport key unavailable');
  return again.enc_key;
}

async function encryptJson(keyB64: string, obj: unknown): Promise<string> {
  const key = await crypto.subtle.importKey('raw', b64decode(keyB64), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return b64encode(out);
}

async function decryptJson<T>(keyB64: string, payload: string): Promise<T> {
  const key = await crypto.subtle.importKey('raw', b64decode(keyB64), 'AES-GCM', false, ['decrypt']);
  const raw = b64decode(payload);
  const iv = raw.slice(0, 12);
  const cipher = raw.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---- shared helpers --------------------------------------------------------

interface Credential {
  username: string;
  password: string;
}
interface Credentials {
  student: Credential | null;
  parent: Credential | null;
}

async function audit(sb: any, actorId: string, action: string, targetId: string, meta: Record<string, unknown>) {
  try {
    await sb.from('audit_logs').insert({
      action,
      actor_id: actorId,
      target_type: 'student_passports',
      target_id: targetId,
      metadata: meta,
    });
  } catch {
    // Audit must never break the caller.
  }
}

/** admin / class teacher / active school manager — mirrors create_roster_student. */
async function assertClassAuthority(sb: any, callerId: string, callerRole: string, classId: string) {
  if (callerRole === 'admin') return;
  const { data: cls } = await sb.from('classes').select('teacher_id, school_id').eq('id', classId).maybeSingle();
  if (!cls) throw new Error('Class not found');
  if (cls.teacher_id === callerId) return;
  if (cls.school_id) {
    const { data: membership } = await sb
      .from('school_memberships')
      .select('id')
      .eq('school_id', cls.school_id)
      .eq('user_id', callerId)
      .eq('role', 'manager')
      .eq('status', 'active')
      .maybeSingle();
    if (membership) return;
  }
  throw new Error('Not authorized for this class');
}

async function usernameTaken(sb: any, candidate: string): Promise<boolean> {
  const { data } = await sb.from('profiles').select('id').eq('username', candidate).maybeSingle();
  return !!data;
}

/**
 * Create the auth user with a synthetic email; returns the final username
 * (may gain a numeric suffix if the preferred name was taken in a race).
 */
async function mintUser(
  sb: any,
  preferredUsername: string,
  password: string,
  role: 'student' | 'parent',
  fullName: string
): Promise<{ userId: string; username: string }> {
  const candidates: string[] = [preferredUsername];
  for (let i = 0; i < 4; i++) {
    candidates.push(`${preferredUsername}${Math.floor(10 + Math.random() * 90)}`);
  }

  let lastError = 'Could not create account';
  for (const username of candidates) {
    if (await usernameTaken(sb, username)) continue;
    const { data, error } = await sb.auth.admin.createUser({
      email: `${username}${EMAIL_DOMAIN}`,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name: fullName },
    });
    if (!error) {
      // handle_new_user already created the profile; stamp the username.
      await sb.from('profiles').update({ username }).eq('id', data.user.id);
      return { userId: data.user.id, username };
    }
    lastError = error.message;
    if (!/already.*(registered|exists)|user already/i.test(error.message)) {
      throw new Error(lastError);
    }
  }
  throw new Error(lastError);
}

Deno.serve(async (req) => {
  return serveEdgeFunction(
    req,
    {
      name: 'student-passports',
      requireAuth: true,
      rateLimit: { maxRequests: 20, windowMs: 60_000 },
      validationRules: [{ field: 'action', required: true, type: 'string' }],
    },
    async (body, auth) => {
      const sb = auth.supabase; // service-role client
      const callerId = auth.userId;
      const callerRole = auth.role;
      const action = body.action;

      switch (action) {
        // ---------------------------------------------------------------
        case 'create': {
          const { class_id, roster_id, display_name, avatar, team } = body;
          const createStudent = body.create_student !== false;
          const createParent = body.create_parent === true;
          if (!class_id) throw new Error('class_id is required');
          if (!roster_id && !display_name) throw new Error('display_name or roster_id is required');
          await assertClassAuthority(sb, callerId, callerRole, class_id);

          const { data: cls, error: clsErr } = await sb
            .from('classes')
            .select('id, teacher_id, school_id, name')
            .eq('id', class_id)
            .maybeSingle();
          if (clsErr || !cls) throw new Error('Class not found');

          // Resolve (or create) the roster row this passport belongs to.
          let roster: any;
          if (roster_id) {
            const { data: r, error: rErr } = await sb
              .from('roster_students')
              .select('*')
              .eq('id', roster_id)
              .maybeSingle();
            if (rErr || !r) throw new Error('Roster student not found');
            if (r.class_id !== class_id) throw new Error('Roster student is not in this class');
            if (r.is_archived) throw new Error('This student is archived');
            roster = r;
          } else {
            const { data: r, error: rErr } = await sb
              .from('roster_students')
              .insert({
                class_id,
                teacher_id: cls.teacher_id,
                display_name: String(display_name).trim(),
                avatar: avatar || null,
                team: team || null,
              })
              .select('*')
              .single();
            if (rErr) throw new Error(rErr.message);
            roster = r;
          }

          // Guard against double-provisioning.
          const { data: existing } = await sb
            .from('student_passports')
            .select('*')
            .eq('roster_student_id', roster.id)
            .maybeSingle();
          if (existing) {
            if (existing.status === 'revoked') {
              throw new Error('This student\'s login cards were deactivated. Remove and re-add the student to create new ones.');
            }
            if (existing.student_user_id) {
              throw new Error('Login cards already exist for this student');
            }
            if (existing.parent_user_id && createParent) {
              throw new Error('A parent login already exists. Use Reset to issue new cards.');
            }
          }

          if (!createStudent && !createParent) throw new Error('Nothing to create');

          const baseName = slugifyBase(roster.display_name);
          let credentials: Credentials = { student: null, parent: null };
          let studentUserId: string | null = null;
          let parentUserId: string | null = null;
          let studentUsername: string | null = null;
          let parentUsername: string | null = null;

          if (createStudent) {
            if (roster.claimed_profile_id) {
              throw new Error('This student already has a linked account. Create a parent login instead.');
            }
            const password = generatePassword();
            const minted = await mintUser(sb, baseName, password, 'student', roster.display_name);
            studentUserId = minted.userId;
            studentUsername = minted.username;

            // Bind exactly like the claim flow: pre-claim + rotate token + enroll.
            const { error: bindErr } = await sb
              .from('roster_students')
              .update({
                claimed_profile_id: studentUserId,
                claimed_at: new Date().toISOString(),
                claim_token: crypto.randomUUID(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', roster.id);
            if (bindErr) throw new Error(bindErr.message);

            const { error: enrollErr } = await sb
              .from('class_enrollments')
              .upsert(
                { class_id, student_id: studentUserId },
                { onConflict: 'class_id,student_id', ignoreDuplicates: true }
              );
            if (enrollErr) throw new Error(enrollErr.message);

            credentials.student = { username: studentUsername, password };
          } else if (!roster.claimed_profile_id) {
            throw new Error('Create the student login first (or share a claim link)');
          }

          if (createParent) {
            const parentBase = `${(studentUsername || baseName).slice(0, 13)}fam`;
            const password = generatePassword();
            const minted = await mintUser(
              sb,
              parentBase,
              password,
              'parent',
              `Parent of ${roster.display_name}`
            );
            parentUserId = minted.userId;
            parentUsername = minted.username;

            // Teacher-created parent is pre-approved: skip the approval queue.
            const { error: linkErr } = await sb
              .from('parent_roster_links')
              .upsert(
                {
                  parent_id: parentUserId,
                  roster_student_id: roster.id,
                  relationship: 'parent',
                  status: 'active',
                  approved_by: callerId,
                  approved_at: new Date().toISOString(),
                },
                { onConflict: 'parent_id,roster_student_id', ignoreDuplicates: false }
              );
            if (linkErr) throw new Error(linkErr.message);

            credentials.parent = { username: parentUsername, password };
          }

          // Persist (or extend) the passport row with encrypted credentials.
          const keyB64 = await ensurePassportKey(sb);
          if (existing && !existing.student_user_id) {
            const priorCreds = await decryptJson<Credentials>(keyB64, existing.credentials_encrypted);
            const merged: Credentials = {
              student: credentials.student || priorCreds.student,
              parent: credentials.parent || priorCreds.parent,
            };
            const encrypted = await encryptJson(keyB64, merged);
            const { error: updErr } = await sb
              .from('student_passports')
              .update({
                parent_user_id: parentUserId,
                parent_username: parentUsername,
                credentials_encrypted: encrypted,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            if (updErr) throw new Error(updErr.message);
            credentials = merged;
          } else {
            const encrypted = await encryptJson(keyB64, credentials);
            const { error: insErr } = await sb.from('student_passports').insert({
              school_id: cls.school_id,
              class_id,
              teacher_id: cls.teacher_id,
              roster_student_id: roster.id,
              student_user_id: studentUserId,
              parent_user_id: parentUserId,
              student_username: studentUsername,
              parent_username: parentUsername,
              credentials_encrypted: encrypted,
              created_by: callerId,
            });
            if (insErr) throw new Error(insErr.message);
          }

          await audit(sb, callerId, existing ? 'passport_parent_added' : 'passport_created', roster.id, {
            student: !!studentUserId,
            parent: !!parentUserId,
          });

          return {
            ok: true,
            card: {
              roster_student_id: roster.id,
              display_name: roster.display_name,
              class_name: cls.name,
              student: credentials.student,
              parent: credentials.parent,
              status: 'active',
            },
          };
        }

        // ---------------------------------------------------------------
        case 'get_cards': {
          const { class_id, roster_id, mark_printed } = body;
          if (!class_id && !roster_id) throw new Error('class_id or roster_id is required');
          if (class_id) await assertClassAuthority(sb, callerId, callerRole, class_id);

          let query = sb.from('student_passports').select('*');
          query = class_id ? query.eq('class_id', class_id) : query.eq('roster_student_id', roster_id);
          const { data: passports, error } = await query;
          if (error) throw new Error(error.message);
          if (!passports.length) return { ok: true, cards: [] };

          const rosterIds = passports.map((p: any) => p.roster_student_id);
          const { data: rosters } = await sb
            .from('roster_students')
            .select('id, display_name')
            .in('id', rosterIds);
          const nameById = new Map((rosters || []).map((r: any) => [r.id, r.display_name]));

          const keyB64 = await ensurePassportKey(sb);
          const cards = [];
          for (const p of passports) {
            const creds = await decryptJson<Credentials>(keyB64, p.credentials_encrypted);
            cards.push({
              roster_student_id: p.roster_student_id,
              display_name: nameById.get(p.roster_student_id) || '',
              student: creds.student,
              parent: creds.parent,
              status: p.status,
              last_printed_at: p.last_printed_at,
            });
          }

          if (mark_printed) {
            await sb
              .from('student_passports')
              .update({ last_printed_at: new Date().toISOString() })
              .in('id', passports.map((p: any) => p.id));
          }
          return { ok: true, cards };
        }

        // ---------------------------------------------------------------
        case 'reset': {
          const { roster_id } = body;
          const target = body.target || 'both';
          if (!roster_id) throw new Error('roster_id is required');
          if (!['student', 'parent', 'both'].includes(target)) throw new Error('Invalid target');

          const { data: p, error: pErr } = await sb
            .from('student_passports')
            .select('*')
            .eq('roster_student_id', roster_id)
            .maybeSingle();
          if (pErr || !p) throw new Error('Passport not found');
          if (p.status !== 'active') throw new Error('This passport is deactivated');
          await assertClassAuthority(sb, callerId, callerRole, p.class_id);

          const keyB64 = await ensurePassportKey(sb);
          const creds = await decryptJson<Credentials>(keyB64, p.credentials_encrypted);

          if ((target === 'student' || target === 'both') && p.student_user_id) {
            const password = generatePassword();
            const { error: updErr } = await sb.auth.admin.updateUserById(p.student_user_id, { password });
            if (updErr) throw new Error(updErr.message);
            creds.student = { username: p.student_username, password };
          }
          if ((target === 'parent' || target === 'both') && p.parent_user_id) {
            const password = generatePassword();
            const { error: updErr } = await sb.auth.admin.updateUserById(p.parent_user_id, { password });
            if (updErr) throw new Error(updErr.message);
            creds.parent = { username: p.parent_username, password };
          }

          const encrypted = await encryptJson(keyB64, creds);
          const { error: saveErr } = await sb
            .from('student_passports')
            .update({ credentials_encrypted: encrypted, updated_at: new Date().toISOString() })
            .eq('id', p.id);
          if (saveErr) throw new Error(saveErr.message);

          await audit(sb, callerId, 'passport_reset', roster_id, { target });

          const { data: roster } = await sb.from('roster_students').select('display_name').eq('id', roster_id).maybeSingle();
          return {
            ok: true,
            card: {
              roster_student_id: roster_id,
              display_name: roster?.display_name || '',
              student: creds.student,
              parent: creds.parent,
              status: p.status,
            },
          };
        }

        // ---------------------------------------------------------------
        case 'deactivate': {
          const { roster_id } = body;
          if (!roster_id) throw new Error('roster_id is required');

          const { data: p, error: pErr } = await sb
            .from('student_passports')
            .select('*')
            .eq('roster_student_id', roster_id)
            .maybeSingle();
          if (pErr || !p) throw new Error('Passport not found');
          await assertClassAuthority(sb, callerId, callerRole, p.class_id);
          if (p.status === 'revoked') return { ok: true };

          for (const userId of [p.student_user_id, p.parent_user_id]) {
            if (!userId) continue;
            const { error } = await sb.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
            if (error) throw new Error(error.message);
          }

          const { error: updErr } = await sb
            .from('student_passports')
            .update({ status: 'revoked', updated_at: new Date().toISOString() })
            .eq('id', p.id);
          if (updErr) throw new Error(updErr.message);

          await audit(sb, callerId, 'passport_deactivated', roster_id, {});
          return { ok: true };
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }
  );
});
