import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { geminiOutput, GeminiQuotaError } from '../netlify/lib/gemini';
import { SYSTEM_PROMPT } from '../netlify/lib/prompt';
import { outputSchema } from '../src/lib/diagnostic/schema';
import { SITE_MINUTE_LIMIT } from '../netlify/lib/limits';
import { LIVE_PRIVACY_NOTICE } from '../src/lib/privacy';
import {
  MAX_ESTIMATED_TOKENS_PER_CALL, MAX_OUTPUT_TOKENS, MAX_PROVIDER_CALLS_PER_MESSAGE,
  MAX_PROVIDER_TEXT_BYTES, MEDIA_RESOLUTION, providerTextBytes,
} from '../netlify/lib/provider-budget';

test('Planning estimate includes all serialized text, image allowance, output and overhead', () => {
  assert.equal(MAX_PROVIDER_CALLS_PER_MESSAGE, 1);
  assert.equal(MAX_ESTIMATED_TOKENS_PER_CALL, 24120);
  assert.ok(MAX_ESTIMATED_TOKENS_PER_CALL * SITE_MINUTE_LIMIT < 250000);
  const fixed = providerTextBytes(SYSTEM_PROMPT, '', outputSchema);
  assert.equal(providerTextBytes(SYSTEM_PROMPT, 'x'.repeat(MAX_PROVIDER_TEXT_BYTES - fixed), outputSchema), MAX_PROVIDER_TEXT_BYTES);
  assert.equal(providerTextBytes(SYSTEM_PROMPT, 'ش', outputSchema), fixed + 2);
  assert.equal(providerTextBytes(SYSTEM_PROMPT, '😀', outputSchema), fixed + 4);
});

test('Transport makes exactly one provider call for errors, malformed and incomplete streams, and success', async (t) => {
  const key = randomBytes(32).toString('hex');
  for (const outcome of ['429', 'stream429', '500', 'throw', 'invalid', 'incomplete', 'success']) {
    let calls = 0;
    const mocked = t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.generationConfig.maxOutputTokens, MAX_OUTPUT_TOKENS);
      assert.equal(body.generationConfig.mediaResolution, MEDIA_RESOLUTION);
      assert.equal(body.generationConfig.candidateCount, 1);
      if (outcome === 'throw') throw new Error('fixture network failure');
      if (outcome === '429' || outcome === '500') return new Response('{}', { status: Number(outcome) });
      if (outcome === 'stream429') return new Response('data: {"error":{"code":429}}\n');
      if (outcome === 'invalid') return new Response('data: invalid\n');
      const content = { candidates: [{ content: { parts: [{ text: '{}' }] }, ...(outcome === 'success' ? { finishReason: 'STOP' } : {}) }] };
      return new Response(`data: ${JSON.stringify(content)}\n`);
    });
    try {
      const call = geminiOutput(key, 'gemini-3.1-flash-lite', SYSTEM_PROMPT, '{}', outputSchema);
      if (outcome === 'success') assert.equal(await call, '{}');
      else if (outcome === '429' || outcome === 'stream429') await assert.rejects(call, GeminiQuotaError);
      else await assert.rejects(call);
      assert.equal(calls, 1);
    } finally { mocked.mock.restore(); }
  }
});

test('All live notices share the deployment-specific privacy constant and README stays consistent', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.equal((app.match(/\{LIVE_PRIVACY_NOTICE\}|\? LIVE_PRIVACY_NOTICE/g) || []).length, 3);
  assert.ok(readFileSync('README.md', 'utf8').includes(LIVE_PRIVACY_NOTICE));
  assert.match(LIVE_PRIVACY_NOTICE, /free tier/);
  assert.match(LIVE_PRIVACY_NOTICE, /unpaid-service terms/);
  assert.match(LIVE_PRIVACY_NOTICE, /Re-check/);
});
