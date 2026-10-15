export type QuotaClient = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
  release: () => void;
};
export type QuotaPool = { connect: () => Promise<QuotaClient> };
export const DAILY_LIMIT_DEFAULT = 200;
export const DAILY_LIMIT_MAX = 200;
export const VISITOR_LIMIT_DEFAULT = 10;
export const VISITOR_LIMIT_MAX = 30;
export const NETWORK_HOURLY_LIMIT = 30;
export const SITE_MINUTE_LIMIT = 10;
export type LimitCode = 'daily' | 'visitor_daily' | 'network_hourly' | 'site_busy';
export type Limit = {
  type: 'live_limit'; code: LimitCode; message: string; resetsAt: string;
};
export function boundedLimit(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}
export function configuredLimits(env: (name: string) => string | undefined) {
  return {
    daily: boundedLimit(env('DAILY_AI_REQUEST_LIMIT'), DAILY_LIMIT_DEFAULT, DAILY_LIMIT_MAX),
    visitorDaily: boundedLimit(env('VISITOR_DAILY_LIMIT'), VISITOR_LIMIT_DEFAULT, VISITOR_LIMIT_MAX),
  };
}

function reached(code: LimitCode, resetsAt: Date): Limit {
  const lead = {
    daily: 'The site-wide daily live limit has been reached.',
    visitor_daily: 'Your daily live limit has been reached.',
    network_hourly: 'This network’s hourly live limit has been reached.',
    site_busy: 'Live mode is busy. Try again in a minute, or at the reset time below.',
  }[code];
  const utc = resetsAt.toISOString();
  return {
    type: 'live_limit', code, resetsAt: utc,
    message: `${lead} Resets at ${utc.slice(0, 10)} ${utc.slice(11, 19)} UTC. Try a guided demo; guided demos remain available and do not use the live limit.`,
  };
}

// Serialize on the daily global row. All checks and increments share one real
// PostgreSQL transaction: a rejected request never increments a partial bucket.
export async function reserveUsage(
  pool: QuotaPool,
  visitorHash: string,
  networkHash: string,
  daily = DAILY_LIMIT_DEFAULT,
  visitorDaily = VISITOR_LIMIT_DEFAULT,
  date = new Date(),
): Promise<Limit | null> {
  const day = date.toISOString().slice(0, 10),
    hour = date.toISOString().slice(0, 13);
  // Also enforce hard bounds for callers that bypass configuredLimits.
  daily = boundedLimit(String(daily), DAILY_LIMIT_DEFAULT, DAILY_LIMIT_MAX);
  visitorDaily = boundedLimit(String(visitorDaily), VISITOR_LIMIT_DEFAULT, VISITOR_LIMIT_MAX);
  const dayReset = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  const hourReset = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours() + 1));
  const minuteStart = Math.floor(date.getTime() / 60000) * 60000;
  const expiry = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 2),
  ).toISOString();
  const buckets = [
    {
      key: `daily:${day}`,
      cap: daily,
      code: 'daily' as const,
      resetsAt: dayReset,
    },
    {
      key: `visitor:${day}:${visitorHash}`,
      cap: visitorDaily,
      code: 'visitor_daily' as const,
      resetsAt: dayReset,
    },
    {
      key: `network:${hour}:${networkHash}`,
      cap: NETWORK_HOURLY_LIMIT,
      code: 'network_hourly' as const,
      resetsAt: hourReset,
    },
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const b of buckets) {
      await client.query(
        'INSERT INTO usage_limits(bucket,used,expires_at) VALUES ($1,0,$2) ON CONFLICT (bucket) DO NOTHING',
        [b.key, expiry],
      );
      const { rows } = await client.query(
        'SELECT used FROM usage_limits WHERE bucket=$1 FOR UPDATE',
        [b.key],
      );
      if (Number(rows[0].used) >= b.cap) {
        await client.query('ROLLBACK');
        return reached(b.code, b.resetsAt);
      }
    }
    // Fixed-minute buckets alone allow 20 calls across a minute boundary.
    // Conservatively include ALL of the preceding minute: any rolling 60-second
    // window has <=10 reservations. A full burst may need up to two UTC ticks.
    const minuteKeys = [minuteStart - 60000, minuteStart].map(
      (ms) => `minute:${new Date(ms).toISOString().slice(0, 16)}`,
    );
    const minuteCounts: number[] = [];
    for (const key of minuteKeys) {
      await client.query(
        'INSERT INTO usage_limits(bucket,used,expires_at) VALUES ($1,0,$2) ON CONFLICT (bucket) DO NOTHING',
        [key, expiry],
      );
      const { rows } = await client.query('SELECT used FROM usage_limits WHERE bucket=$1 FOR UPDATE', [key]);
      minuteCounts.push(Number(rows[0].used));
    }
    if (minuteCounts[0] + minuteCounts[1] >= SITE_MINUTE_LIMIT) {
      await client.query('ROLLBACK');
      return reached('site_busy', new Date(minuteStart + (minuteCounts[1] >= SITE_MINUTE_LIMIT ? 120000 : 60000)));
    }
    for (const b of buckets)
      await client.query(
        'UPDATE usage_limits SET used=used+1 WHERE bucket=$1',
        [b.key],
      );
    await client.query('UPDATE usage_limits SET used=used+1 WHERE bucket=$1', [minuteKeys[1]]);
    await client.query('DELETE FROM usage_limits WHERE expires_at < $1', [
      date.toISOString(),
    ]);
    await client.query('COMMIT');
    return null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
