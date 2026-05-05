import { corsHeaders } from './cors.ts';

const startTime = Date.now();

export function handleHealthCheck(req: Request): Response | null {
  const url = new URL(req.url);
  const pathname = url.pathname;
  if (!pathname.endsWith('/health') && pathname !== '/health') return null;

  const uptime = Date.now() - startTime;
  return new Response(JSON.stringify({
    status: 'ok',
    version: '0.2.0',
    uptime_seconds: Math.floor(uptime / 1000),
    timestamp: new Date().toISOString(),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
