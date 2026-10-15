import { TriangleAlert } from 'lucide-react';
import {
  normalizeSafetyWarning,
  SAFETY_STOP_WARNING,
  getSafetyCopy,
} from '@/lib/diagnostic/safety';

/** Also protects old saved sessions containing a literal "None" warning. */
export function SafetyWarning({
  text,
  stopped,
}: {
  text?: string;
  stopped: boolean;
}) {
  const warning = normalizeSafetyWarning(text);
  if (!stopped && !warning) return null;
  return (
    <div className="safety-warning" role={stopped ? 'alert' : 'note'}>
      <TriangleAlert size={24} />
      <div>
        <h3>{stopped ? getSafetyCopy(text || '').title : 'Safety note'}</h3>
        <p dir="auto">{warning || SAFETY_STOP_WARNING}</p>
      </div>
    </div>
  );
}
