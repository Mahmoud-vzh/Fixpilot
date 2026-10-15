import { MAX_OUTPUT_TOKENS, MEDIA_RESOLUTION } from './provider-budget';

export class GeminiQuotaError extends Error {
  constructor() {
    super('Google’s live request allowance is temporarily unavailable. Its reset time is unavailable; please try again later. Guided demos remain available and do not use the live limit.');
    this.name = 'GeminiQuotaError';
  }
}

// These fields are safe to log. Never log the provider error payload, its
// message, the request, images, credentials, or generated content.
export class GeminiProviderFailure extends Error {
  constructor(
    public readonly source: 'http' | 'stream_event',
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GeminiProviderFailure';
  }
}

export function geminiError(status: number, reason = ''): string {
  if (
    reason === 'API_KEY_INVALID' ||
    reason === 'API_KEY_EXPIRED' ||
    status === 401
  )
    return 'Google rejected the server’s Gemini credential. The site owner must reconnect a valid Gemini key. Your saved diagnosis has not changed.';
  if (reason === 'API_KEY_SERVICE_BLOCKED')
    return 'This Gemini key is not allowed to use the Generative Language API. The site owner must check its API restrictions. Your saved diagnosis has not changed.';
  if (status === 404)
    return 'The selected Gemini model is not available for this API endpoint. The site owner must select an available model. Your saved diagnosis has not changed.';
  if (status === 429)
    return new GeminiQuotaError().message;
  if (status === 400)
    return 'Gemini rejected the request format. The site owner must check the model configuration. Your saved diagnosis has not changed.';
  if (status === 403)
    return 'Google denied Gemini API access. The site owner must check account permissions and regional availability. Your saved diagnosis has not changed.';
  return 'Gemini is temporarily unavailable. Your saved diagnosis has not changed. Please retry later.';
}

type GeminiEvent = {
  error?: { code?: number };
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
};

// Only provider output marked complete can cross the shared schema/safety boundary.
export async function geminiOutput(
  apiKey: string,
  model: string,
  instructions: string,
  evidence: string,
  schema: unknown,
  imageData?: string,
): Promise<string> {
  const parts: unknown[] = [{ text: evidence }];
  if (imageData) {
    const match =
      /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
        imageData,
      );
    if (!match)
      throw new Error(
        'The image format could not be validated. Please upload it again.',
      );
    parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
  }
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } },
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          mediaResolution: MEDIA_RESOLUTION,
          candidateCount: 1,
          thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
        },
      }),
      signal: AbortSignal.timeout(45000),
    },
  );
  if (!upstream.ok) {
    if (upstream.status === 429) throw new GeminiQuotaError();
    // Classify allowlisted error codes without logging provider payloads.
    const payload = (await upstream.json().catch(() => null)) as {
      error?: { message?: string; details?: Array<{ reason?: string }> };
    } | null;
    const allowedReasons = [
      'API_KEY_INVALID',
      'API_KEY_EXPIRED',
      'API_KEY_SERVICE_BLOCKED',
      'SERVICE_DISABLED',
      'CONSUMER_INVALID',
      'LOCATION_POLICY_VIOLATED',
    ];
    const reason =
      payload?.error?.details
        ?.map((d) => d.reason)
        .find((r) => r && allowedReasons.includes(r)) || '';
    throw new GeminiProviderFailure('http', upstream.status, geminiError(upstream.status, reason));
  }
  if (!upstream.body)
    throw new Error('Gemini returned no response. Please retry.');
  const reader = upstream.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    output = '',
    complete = false;
  const line = (raw: string) => {
    if (!raw.startsWith('data:')) return;
    const data = raw.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let event: GeminiEvent;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error(
        'The Gemini stream was invalid. Nothing was saved. Please retry.',
      );
    }
    if (event.error?.code === 429) throw new GeminiQuotaError();
    if (event.error) throw new GeminiProviderFailure(
      'stream_event', event.error.code || 500, geminiError(event.error.code || 500));
    if (event.promptFeedback?.blockReason)
      throw new Error(
        'Gemini could not safely process this request. Nothing was saved. Try a clearer description or contact a qualified technician.',
      );
    const candidate = event.candidates?.[0];
    for (const part of candidate?.content?.parts || []) {
      if (!part.thought && typeof part.text === 'string') output += part.text;
    }
    if (output.length > 100000)
      throw new Error(
        'Model response exceeded the safe limit. Nothing was saved.',
      );
    if (candidate?.finishReason === 'STOP') complete = true;
    else if (candidate?.finishReason === 'MAX_TOKENS')
      throw new Error(
        'The model reached its response limit before finishing. Nothing was saved. Please retry with a shorter description.',
      );
    else if (candidate?.finishReason)
      throw new Error(
        'Gemini could not complete this diagnosis. Nothing was saved. Try a clearer description or contact a qualified technician.',
      );
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer) line(buffer.replace(/\r$/, ''));
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 200000)
        throw new Error(
          'Model response exceeded the safe limit. Nothing was saved.',
        );
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, end).replace(/\r$/, ''));
        buffer = buffer.slice(end + 1);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!complete)
    throw new Error(
      'The Gemini response was interrupted. Nothing was saved. Please retry.',
    );
  return output;
}
