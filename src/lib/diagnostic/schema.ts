import { z } from 'zod';
import { DiagnosticState, Session } from './types';
import { dangerous, safetyStop, normalizeSafetyWarning } from './safety';
const str = z.string().max(6000),
  strings = z.array(str).max(40);
const hypothesis = z
  .object({
    cause: str,
    probability: z.number().min(0).max(100),
    change: z.enum(['up', 'down', 'same', 'ruled_out']),
    supporting_evidence: strings,
    contradicting_evidence: strings,
  })
  .strict();
const test = z
  .object({
    id: str,
    name: str,
    purpose: str,
    difficulty: str,
    estimated_time: str,
    required_tools: strings,
    safety: str,
    instructions: strings,
    outcomes: strings,
  })
  .strict();
export const stateSchema = z
  .object({
    device: str,
    category: str,
    problem_summary: str,
    confirmed_symptoms: strings,
    unknowns: strings,
    hypotheses: z.array(hypothesis).max(8),
    tests_completed: z
      .array(z.object({ name: str, result: str }).strict())
      .max(60),
    next_test: test.nullable(),
    diagnosis_confidence: z.number().min(0).max(100),
    status: z.enum(['investigating', 'diagnosed', 'safety_stop']),
    assistant_message: str,
    safety_warning: str,
    repair_plan: strings,
    verification: str,
    cost: str,
    image_observations: strings,
    image_interpretations: strings,
    timeline: strings,
  })
  .strict();
// A JSON Schema counterpart enables provider-level validation; Zod validates again at the trust boundary.
const s = { type: 'string' },
  a = { type: 'array', items: s };
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const testJSON = object({
  id: s,
  name: s,
  purpose: s,
  difficulty: s,
  estimated_time: s,
  required_tools: a,
  safety: s,
  instructions: a,
  outcomes: a,
});
export const outputSchema = object({
  device: s,
  category: s,
  problem_summary: s,
  confirmed_symptoms: a,
  unknowns: a,
  hypotheses: {
    type: 'array',
    items: object({
      cause: s,
      probability: { type: 'number' },
      change: { type: 'string', enum: ['up', 'down', 'same', 'ruled_out'] },
      supporting_evidence: a,
      contradicting_evidence: a,
    }),
  },
  tests_completed: { type: 'array', items: object({ name: s, result: s }) },
  next_test: { anyOf: [testJSON, { type: 'null' }] },
  diagnosis_confidence: { type: 'number' },
  status: {
    type: 'string',
    enum: ['investigating', 'diagnosed', 'safety_stop'],
  },
  assistant_message: s,
  safety_warning: s,
  repair_plan: a,
  verification: s,
  cost: s,
  image_observations: a,
  image_interpretations: a,
  timeline: a,
});
export function validateAgentOutput(output: string, userText = ''): DiagnosticState {
  let candidate;
  try {
    candidate = stateSchema.parse(JSON.parse(output));
  } catch {
    throw new Error(
      'The model response could not be validated. Nothing was changed. Please retry.',
    );
  }
  candidate.safety_warning = normalizeSafetyWarning(candidate.safety_warning);
  if (candidate.status === 'safety_stop')
    return safetyStop({
      ...candidate,
      timeline: candidate.timeline.slice(0, 38),
    }, userText);
  // Never expose physical tests classified as hazardous, even if the model mislabels the status.
  if (
    dangerous(
      [
        ...(candidate.next_test
          ? [candidate.next_test.name, ...candidate.next_test.instructions]
          : []),
        ...candidate.repair_plan,
        candidate.verification,
      ].join(' '),
    )
  )
    return safetyStop(candidate, userText);
  const sum = candidate.hypotheses.reduce((n, h) => n + h.probability, 0);
  if (sum > 0) {
    const exact = candidate.hypotheses.map((h) => (h.probability / sum) * 100),
      rounded = exact.map(Math.floor);
    const order = exact
      .map((v, i) => ({ i, fraction: v - rounded[i] }))
      .sort((a, b) => b.fraction - a.fraction);
    for (
      let i = 0, remaining = 100 - rounded.reduce((a, b) => a + b, 0);
      i < remaining;
      i++
    )
      rounded[order[i].i]++;
    candidate.hypotheses = candidate.hypotheses.map((h, i) => ({
      ...h,
      probability: rounded[i],
      change: h.probability === 0 ? 'ruled_out' : h.change,
    }));
  }
  if (candidate.status === 'diagnosed' && !candidate.repair_plan.length)
    throw new Error('The proposed diagnosis was incomplete. Please retry.');
  if (candidate.status === 'diagnosed') candidate.next_test = null;
  return candidate;
}
