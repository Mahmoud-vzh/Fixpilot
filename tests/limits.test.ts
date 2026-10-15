import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { reserveUsage, boundedLimit, configuredLimits, SITE_MINUTE_LIMIT, QuotaPool } from '../netlify/lib/limits';

test('Environment values cannot raise or disable hard daily and visitor bounds', () => {
  for (const value of ['201', '999999', '1e9']) {
    assert.deepEqual(configuredLimits(() => value), { daily: 200, visitorDaily: 30 });
  }
  for (const value of [undefined, '', '0', '-1', '1.5', 'Infinity', 'NaN', 'bad']) {
    assert.deepEqual(configuredLimits(() => value), { daily: 200, visitorDaily: 10 });
  }
  assert.deepEqual(configuredLimits(() => '1'), { daily: 1, visitorDaily: 1 });
  assert.equal(SITE_MINUTE_LIMIT, 10);
});

test('Real PostgreSQL-compatible SQL: caps, rollback, isolation, rollover, expiry', async () => {
  const db = new PGlite();
  await db.exec(
    readFileSync(
      'netlify/database/migrations/20261010090000_usage_limits.sql',
      'utf8',
    ),
  );
  // PGlite has one connection. Lease it for complete transactions, like a pool.
  let tail = Promise.resolve();
  const pool: QuotaPool = {
    async connect() {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((r) => (release = r));
      await previous;
      return { query: (sql, params) => db.query(sql, params), release };
    },
  };
  try {
    const day = new Date('2026-10-10T12:00:00Z');
    assert.equal(await reserveUsage(pool, 'alice', 'network', 4, 2, day), null);
    assert.equal(await reserveUsage(pool, 'alice', 'network', 4, 2, day), null);
    assert.equal(
      (await reserveUsage(pool, 'alice', 'network', 4, 2, day))?.code,
      'visitor_daily',
    );
    assert.equal(await reserveUsage(pool, 'bob', 'network', 4, 2, day), null);
    assert.equal(await reserveUsage(pool, 'bob', 'network', 4, 2, day), null);
    assert.equal(
      (await reserveUsage(pool, 'charlie', 'network', 4, 2, day))?.code,
      'daily',
    );
    const { rows } = await db.query<{ used: number }>(
      'SELECT used FROM usage_limits WHERE bucket=$1',
      ['daily:2026-10-10'],
    );
    assert.equal(rows[0].used, 4);
    const next = new Date('2026-10-11T00:00:00Z');
    assert.equal(
      await reserveUsage(pool, 'alice', 'network', 4, 2, next),
      null,
    );
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        reserveUsage(pool, 'visitor' + i, 'network', 4, 2, next),
      ),
    );
    assert.equal(results.filter((r) => r === null).length, 3);
    await reserveUsage(
      pool,
      'alice',
      'network',
      4,
      2,
      new Date('2026-10-14T12:00:00Z'),
    );
    const expired = await db.query(
      'SELECT * FROM usage_limits WHERE expires_at < $1',
      ['2026-10-14T12:00:00Z'],
    );
    assert.equal(expired.rows.length, 0);
    const networkDay = new Date('2026-10-15T12:00:00Z');
    for (let i = 0; i < 30; i++)
      assert.equal(
        await reserveUsage(
          pool,
          'guest' + i,
          'shared-network',
          60,
          10,
          new Date(networkDay.getTime() + Math.floor(i / 10) * 120000),
        ),
        null,
      );
    assert.equal(
      (
        await reserveUsage(
          pool,
          'new-guest',
          'shared-network',
          60,
          10,
          new Date(networkDay.getTime() + 360000),
        )
      )?.code,
      'network_hourly',
    );
    assert.equal(boundedLimit('999', 60, 200), 200);
    assert.equal(boundedLimit('0', 60, 200), 60);
  } finally {
    await db.close();
  }
});

test('Minute reservations are atomic across boundaries and midnight, with exact UTC reset guidance', async () => {
  const db = new PGlite();
  await db.exec(readFileSync('netlify/database/migrations/20261010090000_usage_limits.sql', 'utf8'));
  let tail = Promise.resolve();
  const pool: QuotaPool = { async connect() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return { query: (sql, params) => db.query(sql, params), release };
  } };
  const at = (time: string, id: string, daily = 200, visitor = 10) =>
    reserveUsage(pool, id, `network-${id}`, daily, visitor, new Date(time));
  const assertLimit = (value: Awaited<ReturnType<typeof reserveUsage>>, code: string, reset: string) => {
    assert.ok(value);
    assert.equal(value.code, code);
    assert.equal(value.resetsAt, reset);
    assert.match(value.message, /UTC/);
    assert.match(value.message, /guided demos remain available and do not use the live limit/);
    assert.doesNotMatch(value.message, /network-|visitor:|daily:|minute:/);
  };
  try {
    const concurrent = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      at('2026-10-14T23:59:59Z', `guest${i}`)));
    assert.equal(concurrent.filter(x => x === null).length, 10);
    assertLimit(concurrent.find(x => x !== null)!, 'site_busy', '2026-10-15T00:01:00.000Z');
    assertLimit(await at('2026-10-15T00:00:00Z', 'fresh'), 'site_busy', '2026-10-15T00:01:00.000Z');
    // No partial new-day/visitor increments on rejection.
    assert.equal((await db.query("SELECT * FROM usage_limits WHERE bucket='daily:2026-10-15'")).rows.length, 0);
    assert.equal(await at('2026-10-15T00:01:00Z', 'fresh'), null);
    assertLimit(await at('2026-10-15T00:02:00Z', 'fresh', 200, 1), 'visitor_daily', '2026-10-16T00:00:00.000Z');
    assertLimit(await at('2026-10-15T00:02:00Z', 'other', 1), 'daily', '2026-10-16T00:00:00.000Z');
    await db.exec('DELETE FROM usage_limits');
    await db.query('INSERT INTO usage_limits VALUES ($1,$2,$3)', ['network:2026-10-15T12:network-secret', 30, '2026-10-17T00:00:00Z']);
    assertLimit(await at('2026-10-15T12:59:59Z', 'secret'), 'network_hourly', '2026-10-15T13:00:00.000Z');
    assert.equal(await at('2026-10-15T13:00:00Z', 'secret'), null);
    // Hard bounds are enforced inside reservation, not just in env parsing.
    await db.query('INSERT INTO usage_limits VALUES ($1,$2,$3)', ['daily:2026-10-16', 200, '2026-10-18T00:00:00Z']);
    assertLimit(await at('2026-10-16T00:00:00Z', 'huge', 999999, 999999), 'daily', '2026-10-17T00:00:00.000Z');
    await db.query('INSERT INTO usage_limits VALUES ($1,$2,$3)', ['visitor:2026-10-17:huge', 30, '2026-10-19T00:00:00Z']);
    assertLimit(await at('2026-10-17T00:00:00Z', 'huge', 999999, 999999), 'visitor_daily', '2026-10-18T00:00:00.000Z');
  } finally { await db.close(); }
});
