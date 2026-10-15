import { configuredLimits, type QuotaPool } from './limits';
import { visitorIdentity } from './identity';
import type { PublicConfig } from '../../src/lib/live-config';

export async function publicConfig(request: Request, deps: {
  env: (name: string) => string | undefined;
  pool: () => QuotaPool;
  ip: string;
  now?: () => Date;
}) {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const key = deps.env('GEMINI_API_KEY');
  const data: PublicConfig = {
    liveAI: deps.env('LIVE_AI_ENABLED') === 'true' && Boolean(key),
    provider: 'gemini',
    model: deps.env('GEMINI_MODEL') || 'gemini-3.1-flash-lite',
    usage: null,
  };
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    Vary: 'Cookie',
  };
  if (data.liveAI && key) {
    const now = deps.now?.() || new Date();
    const day = now.toISOString().slice(0, 10);
    const identity = visitorIdentity(request, key, deps.ip, now);
    headers['Set-Cookie'] = identity.cookie;
    try {
      const client = await deps.pool().connect();
      try {
        const { rows } = await client.query(
          'SELECT used FROM usage_limits WHERE bucket=$1',
          [`visitor:${day}:${identity.visitorHash}`],
        );
        const used = rows.length ? Number(rows[0].used) : 0;
        if (!Number.isSafeInteger(used) || used < 0) throw new Error('Invalid counter');
        data.usage = {
          used,
          limit: configuredLimits(deps.env).visitorDaily,
          day,
          resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString(),
        };
      } finally { client.release(); }
    } catch {
      // An unavailable database is not a zero count. No content or errors logged.
      data.usage = null;
    }
  }
  return Response.json(data, { headers });
}
