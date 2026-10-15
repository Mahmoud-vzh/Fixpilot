import { z } from 'zod';
import {
  stateSchema,
  outputSchema,
  validateAgentOutput,
} from '../../src/lib/diagnostic/schema';
import { dangerous, safetyStop } from '../../src/lib/diagnostic/safety';
import { geminiOutput, GeminiQuotaError, GeminiProviderFailure } from './gemini';
import { SYSTEM_PROMPT } from './prompt';
import {
  hasDiagnosticContent,
  INTAKE_GUIDANCE,
} from '../../src/lib/diagnostic/session';
import { reserveUsage, configuredLimits, QuotaPool } from './limits';
import { MAX_PROVIDER_TEXT_BYTES, providerTextBytes } from './provider-budget';
import { visitorIdentity } from './identity';
export const requestSchema = z
  .object({
    state: stateSchema,
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            text: z.string().max(12000),
          })
          .strict(),
      )
      .max(16),
    text: z.string().trim().min(1).max(12000),
    image: z.string().max(2800000).optional(),
  })
  .strict();
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const reply = (body: unknown, status = 200, cookie?: string) =>
  Response.json(body, {
    status,
    headers: { ...headers, ...(cookie ? { 'Set-Cookie': cookie } : {}) },
  });
export type Dependencies = {
  env: (name: string) => string | undefined;
  pool: () => QuotaPool;
  model?: typeof geminiOutput;
  ip: string;
  now?: () => Date;
};
export function validImage(image: string) {
  const m =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      image,
    );
  if (!m || m[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > 2 * 1024 * 1024) return false;
  return m[1] === 'image/png'
    ? bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : m[1] === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP';
}
async function boundedBody(req: Request) {
  if (!req.body) throw new Error('empty');
  const reader = req.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 3000000) throw new Error('size');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function handleDiagnosis(
  req: Request,
  deps: Dependencies,
): Promise<Response> {
  if (req.method !== 'POST')
    return reply({ message: 'Use POST for live diagnosis.' }, 405);
  if (req.headers.get('origin') !== new URL(req.url).origin)
    return reply({ message: 'Please send this request from FixPilot.' }, 403);
  if (!req.headers.get('content-type')?.includes('application/json'))
    return reply({ message: 'Send a JSON request.' }, 415);
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await boundedBody(req));
  } catch {
    return reply(
      {
        message:
          'This request is empty, too large or invalid. Shorten the description and use an image under 2 MB.',
      },
      400,
    );
  }
  if (input.image && !validImage(input.image))
    return reply(
      { message: 'Use a valid PNG, JPEG or WebP image under 2 MB.' },
      400,
    );
  if (input.state.status === 'safety_stop' || dangerous(input.text))
    return reply({ state: safetyStop(input.state, input.text) });
  if (
    !input.image &&
    !hasDiagnosticContent(input.text) &&
    input.state.device === 'Not identified' &&
    !input.messages.some(
      (m) => m.role === 'user' && hasDiagnosticContent(m.text),
    )
  )
    return reply({ type: 'needs_details', message: INTAKE_GUIDANCE });
  const key = deps.env('GEMINI_API_KEY');
  if (deps.env('LIVE_AI_ENABLED') !== 'true' || !key)
    return reply(
      {
        type: 'unavailable',
        message:
          'Live mode is not enabled in this public demo; guided demos are available.',
      },
      503,
    );
  const evidence = JSON.stringify({
    state: input.state,
    recent_messages: input.messages,
    new_evidence: input.text,
  });
  if (providerTextBytes(SYSTEM_PROMPT, evidence, outputSchema) > MAX_PROVIDER_TEXT_BYTES)
    return reply({
      type: 'needs_details',
      message: 'This conversation is too large for the live demo’s token allowance. Shorten your message or start a new diagnosis with a concise summary. Nothing was sent and no live quota was used. Guided demos remain available.',
    }, 400);
  const now = deps.now?.() || new Date();
  const identity = visitorIdentity(req, key, deps.ip, now);
  const caps = configuredLimits(deps.env);
  try {
    const limit = await reserveUsage(
      deps.pool(),
      identity.visitorHash,
      identity.networkHash,
      caps.daily,
      caps.visitorDaily,
      now,
    );
    if (limit) return reply(limit, 429, identity.cookie);
  } catch {
    return reply(
      {
        type: 'unavailable',
        message:
          'Live mode is temporarily unavailable while its usage limiter connects. Please try a guided demo.',
      },
      503,
      identity.cookie,
    );
  }
  let phase: 'provider' | 'validation' = 'provider';
  let output = '';
  try {
    output = await (deps.model || geminiOutput)(
      key,
      deps.env('GEMINI_MODEL') || 'gemini-3.1-flash-lite',
      SYSTEM_PROMPT,
      evidence,
      outputSchema,
      input.image,
    );
    phase = 'validation';
    return reply({ state: validateAgentOutput(output, input.text) }, 200, identity.cookie);
  } catch (error) {
    // Never log or return request bodies, images, provider payloads or exceptions.
    if (error instanceof GeminiQuotaError)
      return reply({ type: 'live_limit', code: 'provider', resetsAt: null, message: new GeminiQuotaError().message }, 429, identity.cookie);
    const timeout =
      error instanceof Error &&
      ['TimeoutError', 'AbortError'].includes(error.name);
    // Only fixed diagnostic labels and bounded numeric HTTP status are logged.
    // Do not log raw errors, user data, IPs, cookies, keys, or Gemini content.
    let category = 'provider_other';
    let providerStatus: number | undefined;
    if (phase === 'validation') {
      category = 'invalid_state';
      try { JSON.parse(output); } catch { category = 'invalid_json'; }
    } else if (error instanceof GeminiProviderFailure) {
      category = error.source === 'http' ? 'provider_http' : 'provider_stream_http';
      if (Number.isInteger(error.status) && error.status >= 400 && error.status <= 599)
        providerStatus = error.status;
    } else if (timeout) {
      category = 'provider_timeout';
    } else if (error instanceof TypeError) {
      category = 'provider_transport';
    } else if (error instanceof Error) {
      // These values are compared against known internal constants, not logged.
      switch (error.message) {
        case 'The Gemini stream was invalid. Nothing was saved. Please retry.':
          category = 'stream_invalid'; break;
        case 'The Gemini response was interrupted. Nothing was saved. Please retry.':
          category = 'stream_incomplete'; break;
        case 'The model reached its response limit before finishing. Nothing was saved. Please retry with a shorter description.':
          category = 'max_output_tokens'; break;
        case 'Gemini returned no response. Please retry.':
          category = 'no_response_body'; break;
        case 'Model response exceeded the safe limit. Nothing was saved.':
          category = 'output_size'; break;
        case 'Gemini could not safely process this request. Nothing was saved. Try a clearer description or contact a qualified technician.':
          category = 'provider_safety_block'; break;
        case 'Gemini could not complete this diagnosis. Nothing was saved. Try a clearer description or contact a qualified technician.':
          category = 'provider_finish_reason'; break;
      }
    }
    console.warn('FixPilot live diagnosis failure', {
      category, ...(providerStatus === undefined ? {} : { providerStatus }),
    });
    return reply(
      {
        type: 'unavailable',
        message: timeout
          ? 'Gemini took too long to respond. Your local history is unchanged. Try a guided demo or retry later.'
          : 'Gemini could not complete a validated response. Your local history is unchanged. Try a guided demo or retry later.',
      },
      502,
      identity.cookie,
    );
  }
}
