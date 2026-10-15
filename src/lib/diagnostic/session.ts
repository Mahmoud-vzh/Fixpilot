import { blankState, Session } from './types';
import { getSafetyCopy } from './safety';
import { startDemo, scenarios } from './demo';
// Conservative intake filter, not a semantic classifier. Short technical reports
// ("smoke", "WiFi", error codes) must still reach the diagnostic/safety agent.
export function hasDiagnosticContent(text: string) {
  const words = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const filler = new Set([
    'hello',
    'hi',
    'hey',
    'greetings',
    'good',
    'morning',
    'afternoon',
    'evening',
    'thanks',
    'thank',
    'you',
    'ok',
    'okay',
    'yes',
    'no',
    'please',
    'help',
    'me',
    'can',
    'could',
    'would',
    'i',
    'need',
    'some',
    'a',
    'test',
    'testing',
    'start',
    'there',
    'fixpilot',
    'how',
    'are',
    'doing',
    'what',
    's',
    'up',
    'have',
    'an',
    'problem',
    'issue',
    'with',
    'my',
    'device',
    'system',
  ]);
  return words.some((word) => word.length > 1 && !filler.has(word));
}
export const INTAKE_GUIDANCE =
  'Hi! Tell me the device or system and what is going wrong. Include what changed and anything you have already tried.';
// getRandomValues also works on the HTTP development preview. No weak random fallback.
export function sessionId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function shortTitle(text: string) {
  return (
    text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\([^)]*unspecified[^)]*\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 5)
      .join(' ')
      .slice(0, 90) || 'New diagnosis'
  );
}
export function sessionTitle(s: Session) {
  return (
    s.title ||
    shortTitle(
      s.messages.find((m) => m.role === 'user')?.text ||
        s.state.device.replace(/\s*\(unspecified\)/gi, ''),
    )
  );
}
export function sessionStatus(s: Session) {
  if (s.resolved_at) return 'Resolved';
  if (s.state.status === 'safety_stop') return getSafetyCopy(s.state.safety_warning).status;
  if (s.state.status === 'diagnosed') return 'Report ready';
  if (s.state.unknowns.length || !s.state.next_test) return 'Needs info';
  return 'In progress';
}
export function draftSession(
  mode: 'demo' | 'live',
  scenario = 'robot',
  id = sessionId(),
): Session {
  const now = new Date().toISOString(),
    state = mode === 'demo' ? startDemo(scenario) : blankState();
  return {
    id,
    mode,
    scenario,
    state,
    messages: [
      ...(mode === 'demo'
        ? [
            {
              id: sessionId(),
              role: 'user' as const,
              text: state.problem_summary,
              created_at: now,
            },
          ]
        : []),
      {
        id: sessionId(),
        role: 'assistant',
        text: state.assistant_message,
        created_at: now,
      },
    ],
    updated_at: now,
    revision: 0,
    persisted: false,
  };
}
export function validScenario(id: string) {
  return scenarios.some((s) => s.id === id);
}
export const liveExample =
  'My Windows laptop connects to home Wi-Fi but cannot open websites. My phone works on the same Wi-Fi with mobile data off. It started after I installed a VPN yesterday. I have not changed any network settings yet. Ask me one targeted question before suggesting changes.';
