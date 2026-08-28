// Shared passport utilities: QR payload encoding/decoding and the
// username -> synthetic-email resolution used by the login form.
//
// The printed QR encodes `{origin}/login#p=<base64url(username:password)>`.
// The fragment (#) is never sent to a server, so the credentials cannot end
// up in server logs. Scanning with the phone's native camera app or the
// in-app scanner both land on the same login-page handler.

export const PASSPORT_EMAIL_DOMAIN = '@passport.local';

/**
 * Resolve a login identifier to the email Supabase auth expects.
 * Passport accounts log in with their username (no '@'), which maps
 * deterministically to the synthetic email the edge function registered.
 */
export function resolveLoginIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) return trimmed;
  return `${trimmed.toLowerCase()}${PASSPORT_EMAIL_DOMAIN}`;
}

// ---- base64url helpers (ASCII payloads, UTF-8-safe decode anyway) ----

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export interface LoginPayload {
  username: string;
  password: string;
}

function isValidPayload(p: LoginPayload | null): p is LoginPayload {
  return !!p && !!p.username && !!p.password && p.username.includes(':') === false;
}

/** The `#p=` value for a card QR: base64url(username:password). */
export function encodeLoginPayload(username: string, password: string): string {
  return b64urlEncode(`${username}:${password}`);
}

/** Full QR content for a login card. */
export function buildLoginQrUrl(username: string, password: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/login#p=${encodeLoginPayload(username, password)}`;
}

/** Decode a `#p=` payload value. Returns null when malformed. */
export function decodeLoginPayload(value: string): LoginPayload | null {
  try {
    const idx = value.indexOf(':');
    if (idx <= 0) return null;
    return { username: value.slice(0, idx), password: value.slice(idx + 1) };
  } catch {
    return null;
  }
}

/**
 * Parse anything a scanner might produce: the full login URL
 * (`https://host/login#p=...`), a bare `p=...` fragment, or a raw payload.
 */
export function parseQrText(text: string): LoginPayload | null {
  const raw = (text || '').trim();
  if (!raw) return null;

  let payloadValue: string | null = null;
  const hashMatch = raw.match(/[#&?]p=([^&#\s]+)/);
  if (hashMatch) {
    payloadValue = hashMatch[1];
  } else if (/^p=/.test(raw)) {
    payloadValue = raw.slice(2);
  } else if (/^[A-Za-z0-9_-]+$/.test(raw)) {
    payloadValue = raw;
  }
  if (!payloadValue) return null;

  try {
    const decoded = decodeLoginPayload(b64urlDecode(payloadValue));
    return isValidPayload(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
