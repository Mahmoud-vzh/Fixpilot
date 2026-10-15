import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { publicConfig } from '../netlify/lib/config';
import { visitorIdentity } from '../netlify/lib/identity';

const request = new Request('https://example.test/api/config');
const key = randomBytes(32).toString('hex');
const date = new Date('2026-10-11T12:00:00Z');
const env = (flag: string | undefined, hasKey = true) => (name: string) =>
  name === 'LIVE_AI_ENABLED' ? flag : name === 'GEMINI_API_KEY' && hasKey ? key : undefined;
const neverPool = () => { throw new Error('Unexpected database access'); };

test('Config defaults off, needs both explicit opt-in and a key, and exposes no secret', async () => {
  for (const [flag, hasKey] of [[undefined,true], ['false',true], ['TRUE',true], ['true',false]] as const) {
    const response = await publicConfig(request, { env:env(flag,hasKey), pool:neverPool, ip:'192.0.2.1' });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Set-Cookie'), null);
    const text = await response.text();
    assert.equal(JSON.parse(text).liveAI, false);
    assert.equal(JSON.parse(text).usage, null);
    assert.ok(!text.includes(key));
  }
});
test('Live config reads only this signed visitor/day counter without reserving usage', async () => {
  const identity = visitorIdentity(request, key, '192.0.2.1', date);
  const signedRequest = new Request(request.url, { headers:{ cookie:identity.cookie.split(';')[0] } });
  let queries = 0, released = false;
  const response = await publicConfig(signedRequest, {
    env:env('true'), ip:'192.0.2.1', now:()=>date,
    pool:()=>({connect:async()=>({
      query:async(sql,params)=>{
        queries++;
        assert.equal(sql,'SELECT used FROM usage_limits WHERE bucket=$1');
        assert.deepEqual(params,[`visitor:2026-10-11:${identity.visitorHash}`]);
        return {rows:[{used:4}]};
      },
      release:()=>{released=true;},
    })}),
  });
  const text = await response.text(), data = JSON.parse(text);
  assert.equal(data.liveAI,true);
  assert.deepEqual(data.usage,{used:4,limit:10,day:'2026-10-11',resetsAt:'2026-10-12T00:00:00.000Z'});
  assert.equal(queries,1); assert.equal(released,true);
  assert.ok(response.headers.get('Set-Cookie')?.includes('HttpOnly'));
  assert.ok(!text.includes(key)); assert.ok(!text.includes(identity.visitorHash));
});
test('Missing quota row means zero; unavailable database means unknown, never invented zero', async () => {
  const empty = await publicConfig(request, {env:env('true'),ip:'192.0.2.1',now:()=>date,
    pool:()=>({connect:async()=>({query:async()=>({rows:[]}),release(){}})})});
  assert.equal((await empty.json()).usage.used,0);
  const failed = await publicConfig(request,{env:env('true'),ip:'192.0.2.1',pool:neverPool});
  assert.equal((await failed.json()).usage,null);
});

test('Usage config uses the same hard visitor bound and next UTC day at rollover', async () => {
  const response = await publicConfig(request, {
    env: n => n === 'VISITOR_DAILY_LIMIT' ? '99999' : env('true')(n),
    ip: '192.0.2.1', now: () => new Date('2026-12-31T23:59:59Z'),
    pool: () => ({ connect: async () => ({ query: async () => ({ rows: [{ used: 7 }] }), release() {} }) }),
  });
  assert.deepEqual((await response.json()).usage, {
    used: 7, limit: 30, day: '2026-12-31', resetsAt: '2027-01-01T00:00:00.000Z',
  });
});
