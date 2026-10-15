import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handleDiagnosis } from '../netlify/lib/handler';
import { GeminiProviderFailure, geminiOutput } from '../netlify/lib/gemini';
import { blankState } from '../src/lib/diagnostic/types';

// Synthetic values only. Neither request text nor provider exceptions may enter logs.
const fakeKey = randomBytes(32).toString('hex');
const privateMarker = 'private-fixture-text-not-for-logs';
const request = () => new Request('https://example.test/api/diagnose', {
  method: 'POST',
  headers: { origin: 'https://example.test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ state: blankState(), messages: [], text: `Laptop screen black. ${privateMarker}` }),
});
const pool = () => ({
  async connect() {
    return {
      async query(sql: string) {
        return { rows: sql.startsWith('SELECT') ? [{ used: 0 }] : [] };
      },
      release() {},
    };
  },
});

test('Live failure logs fixed diagnostic labels, never request data or exceptions', async (t) => {
  const entries: unknown[][] = [];
  const warn = t.mock.method(console, 'warn', (...args: unknown[]) => { entries.push(args); });
  const cases: Array<{
    model: () => Promise<string>;
    category: string;
    providerStatus?: number;
  }> = [
    { model: async () => 'not-json', category: 'invalid_json' },
    { model: async () => '{}', category: 'invalid_state' },
    {
      model: async () => { throw new GeminiProviderFailure('http', 503, privateMarker); },
      category: 'provider_http', providerStatus: 503,
    },
    {
      model: async () => { throw new GeminiProviderFailure('stream_event', 500, privateMarker); },
      category: 'provider_stream_http', providerStatus: 500,
    },
    { model: async () => { throw new TypeError(privateMarker); }, category: 'provider_transport' },
    {
      model: async () => { throw new Error('The Gemini response was interrupted. Nothing was saved. Please retry.'); },
      category: 'stream_incomplete',
    },
    {
      model: async () => { throw new Error('The model reached its response limit before finishing. Nothing was saved. Please retry with a shorter description.'); },
      category: 'max_output_tokens',
    },
    { model: async () => { throw new Error(privateMarker); }, category: 'provider_other' },
  ];
  try {
    for (const item of cases) {
      entries.length = 0;
      const response = await handleDiagnosis(request(), {
        env: (name) => name === 'GEMINI_API_KEY' ? fakeKey : name === 'LIVE_AI_ENABLED' ? 'true' : undefined,
        pool,
        ip: '192.0.2.1',
        model: item.model,
      });
      assert.equal(response.status, 502);
      assert.equal(entries.length, 1);
      assert.equal(entries[0][0], 'FixPilot live diagnosis failure');
      assert.deepEqual(entries[0][1], {
        category: item.category,
        ...(item.providerStatus === undefined ? {} : { providerStatus: item.providerStatus }),
      });
      const publicOutput = await response.text();
      const loggedOutput = JSON.stringify(entries);
      for (const sensitive of [fakeKey, privateMarker, '192.0.2.1']) {
        assert.ok(!publicOutput.includes(sensitive));
        assert.ok(!loggedOutput.includes(sensitive));
      }
    }
  } finally {
    warn.mock.restore();
  }
});

test('Gemini HTTP failures expose an allowlisted status, not response content', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(privateMarker, { status: 503 }));
  try {
    await assert.rejects(
      geminiOutput(fakeKey, 'gemini-3.1-flash-lite', 'fixture', '{}', {}),
      (error: unknown) => error instanceof GeminiProviderFailure &&
        error.source === 'http' && error.status === 503 &&
        !error.message.includes(privateMarker),
    );
    assert.equal(fetch.mock.callCount(), 1);
  } finally {
    fetch.mock.restore();
  }
});
