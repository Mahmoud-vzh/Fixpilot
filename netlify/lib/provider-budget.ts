// Planning estimates for gemini-3.1-flash-lite, not measured token counts.
// One admitted message makes one generation request; no automatic retries.
export const MAX_PROVIDER_CALLS_PER_MESSAGE = 1;
export const MAX_PROVIDER_TEXT_BYTES = 16000;
export const MAX_OUTPUT_TOKENS = 6000;
export const IMAGE_TOKEN_ESTIMATE = 1120;
export const TOKEN_OVERHEAD_ESTIMATE = 1000;
export const MEDIA_RESOLUTION = 'MEDIA_RESOLUTION_HIGH';

// Count the actual serialized state/history/new evidence, instructions and schema.
// UTF-8 bytes are deliberately more conservative than English chars / 4.
export function providerTextBytes(instructions: string, evidence: string, schema: unknown) {
  return Buffer.byteLength(instructions, 'utf8') +
    Buffer.byteLength(evidence, 'utf8') +
    Buffer.byteLength(JSON.stringify(schema), 'utf8');
}

export const MAX_ESTIMATED_TOKENS_PER_CALL = MAX_PROVIDER_TEXT_BYTES +
  IMAGE_TOKEN_ESTIMATE + MAX_OUTPUT_TOKENS + TOKEN_OVERHEAD_ESTIMATE;
