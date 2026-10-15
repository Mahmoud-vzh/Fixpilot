import { Session } from './diagnostic/types';
import { advanceDemo } from './diagnostic/demo';
import {
  hasDiagnosticContent,
  INTAKE_GUIDANCE,
  sessionId,
  shortTitle,
} from './diagnostic/session';
import { stateSchema } from './diagnostic/schema';
import { workspace } from './workspace';
import { LIVE_DISABLED_MESSAGE } from './live-config';
export type DiagnosisResult =
  | { type: 'result'; session: Session }
  | { type: 'needs_details'; message: string }
  | { type: 'live_disabled'; message: string }
  | { type: 'live_limit'; message: string };
export async function diagnose(
  target: Session,
  text: string,
  image?: string,
  liveEnabled = false,
): Promise<DiagnosisResult> {
  if (target.mode === 'live' && !liveEnabled)
    return { type: 'live_disabled', message: LIVE_DISABLED_MESSAGE };
  if (
    target.mode === 'live' &&
    target.persisted === false &&
    !image &&
    !hasDiagnosticContent(text)
  )
    return { type: 'needs_details', message: INTAKE_GUIDANCE };
  let state;
  if (target.mode === 'demo') state = advanceDemo(target.state, text);
  else {
    if (!navigator.onLine)
      throw new Error(
        'You are offline. Reconnect to use live mode, or try a guided demo.',
      );
    const response = await fetch('/api/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: target.state,
        messages: target.messages
          .slice(-16)
          .map(({ role, text }) => ({ role, text })),
        text,
        image,
      }),
      signal: AbortSignal.timeout(55000),
    });
    const data = await response.json();
    if (data.type === 'live_limit' || data.type === 'needs_details')
      return { type: data.type, message: data.message };
    if (!response.ok)
      throw new Error(
        data.message ||
          'Live mode is temporarily unavailable. Try a guided demo.',
      );
    state = stateSchema.parse(data.state);
  }
  const now = new Date().toISOString();
  // Unsaved greetings are not used for the title, but stay in the conversation.
  const next: Session = {
    ...target,
    state,
    title:
      target.title ||
      shortTitle(target.mode === 'demo' ? target.state.problem_summary : text),
    persisted: true,
    revision: target.revision + 1,
    updated_at: now,
    resolved_at: undefined,
    messages: [
      ...target.messages,
      {
        id: sessionId(),
        role: 'user',
        text,
        created_at: now,
        ...(image ? { image } : {}),
      },
      {
        id: sessionId(),
        role: 'assistant',
        text: state.assistant_message,
        created_at: now,
      },
    ],
  };
  await workspace.save(next, target.revision);
  return { type: 'result', session: next };
}
