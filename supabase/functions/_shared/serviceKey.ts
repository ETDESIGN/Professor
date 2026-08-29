// The platform injects a NEW-STYLE (non-JWT) service key as
// SUPABASE_SERVICE_ROLE_KEY. PostgREST accepts it, but the legacy Storage
// endpoint (/storage/v1/object/...) rejects non-JWT bearers with
// "Invalid Compact JWS" — which silently broke every edge-side storage upload
// (illustrations, TTS audio, book crops) while REST kept working, so the
// functions fell back to dicebear/dummy URLs. SVC_ROLE_JWT holds the legacy
// service-role JWT (still issued per project) and is preferred for Storage.
export function serviceRoleKey(): string {
  return Deno.env.get('SVC_ROLE_JWT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}
