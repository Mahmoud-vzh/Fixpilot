'use client';
import {
  Activity,
  Check,
  FlaskConical,
  ShieldCheck,
  Clock,
  Wrench,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  CircleHelp,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DiagnosticState, DiagnosticTest } from '@/lib/diagnostic/types';
export function estimate(value: number, mode: 'demo' | 'live') {
  return mode === 'live' ? `~${Math.round(value / 5) * 5}%` : `${value}%`;
}
function ConfidenceHelp({ mode }: { mode: 'demo' | 'live' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="icon-button"
          aria-label="How are confidence and cause weights calculated?"
        >
          <CircleHelp size={17} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="confidence-help">
        <p>
          {mode === 'demo'
            ? 'Guided demo: values are authored in the branching rules. Test outcomes select preset cause weights and a preset diagnosis confidence. They are illustrative, not measured accuracy.'
            : 'Live mode: Gemini estimates the cause weights and diagnosis confidence from the reported evidence. The server normalizes cause weights to 100; this display rounds to the nearest 5%. These are not calibrated probabilities or measured accuracy.'}
        </p>
        <p>
          Diagnosis confidence estimates support for the proposed diagnosis and
          is shown only once a diagnosis is reached. Cause weights rank
          competing explanations during the diagnosis. A leading cause weight is
          not diagnosis confidence. Neither is a statistical calculation from
          validated measurements. Weights assume one main cause. Multiple
          simultaneous faults are possible.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
export function HypothesisPanel({
  state,
  mode,
}: {
  state: DiagnosticState;
  mode: 'demo' | 'live';
}) {
  return (
    <aside className="diagnostic-panel">
      <div className="panel-title">
        <span>
          <Activity size={16} /> EVIDENCE NOTEBOOK
        </span>
        <ConfidenceHelp mode={mode} />
      </div>
      <section className="device-summary">
        <div className="eyebrow">DEVICE / SYSTEM</div>
        <h3>{state.device.replace(/\s*\(unspecified\)/gi, '')}</h3>
        <p>{state.category}</p>
        <div className="confidence-row">
          <span>
            {state.status !== 'diagnosed'
              ? 'Diagnosis confidence'
              : mode === 'live'
                ? 'Estimated confidence'
                : 'Demo confidence'}
          </span>
          <strong>
            {state.status === 'diagnosed'
              ? estimate(state.diagnosis_confidence, mode)
              : 'Not reached yet'}
          </strong>
        </div>
        {state.status === 'diagnosed' && (
          <Progress
            value={state.diagnosis_confidence}
            aria-label="Estimated diagnosis confidence"
            className="confidence-track"
          />
        )}
        <p className="tiny">
          {state.status === 'diagnosed'
            ? 'Provisional diagnosis · verify the repair'
            : 'Gathering evidence · no final diagnosis'}
        </p>
      </section>
      <section>
        <div className="section-title">
          <h3>Possible causes</h3>
        </div>
        <p className="tiny">
          {mode === 'live'
            ? 'Model-estimated relative weights.'
            : 'Authored scenario weights.'}{' '}
          Assumes one main cause; multiple faults may coexist.
        </p>
        <div className="hypotheses">
          {state.hypotheses.length ? (
            state.hypotheses
              .slice()
              .sort((a, b) => b.probability - a.probability)
              .map((h, i) => (
                <div
                  className={'hypothesis ' + (i === 0 ? 'leading' : '')}
                  key={h.cause}
                >
                  <div className="hypothesis-label">
                    <span>{h.cause}</span>
                    <b>{estimate(h.probability, mode)}</b>
                  </div>
                  <Progress
                    value={h.probability}
                    aria-label={h.cause + ' relative weight'}
                  />
                  <div className="hypothesis-trend">
                    {h.change === 'up' ? (
                      <>
                        <TrendingUp size={12} /> More likely
                      </>
                    ) : h.change === 'down' ? (
                      <>
                        <TrendingDown size={12} /> Less likely
                      </>
                    ) : h.change === 'ruled_out' ? (
                      <>
                        <Check size={12} /> Ruled out in this assessment
                      </>
                    ) : (
                      <>Still possible</>
                    )}
                  </div>
                  {h.supporting_evidence.length > 0 && (
                    <details>
                      <summary>
                        Evidence <ChevronDown size={12} />
                      </summary>
                      <p>{h.supporting_evidence.join(' · ')}</p>
                    </details>
                  )}
                </div>
              ))
          ) : (
            <p className="muted">
              Describe the issue to build the first hypotheses.
            </p>
          )}
        </div>
      </section>
      <section>
        <h3>
          Reported evidence{' '}
          <span className="count">{state.confirmed_symptoms.length}</span>
        </h3>
        <div className="evidence-list">
          {state.confirmed_symptoms.map((e, i) => (
            <div key={i}>
              <Check size={14} />
              <span dir="auto">{e}</span>
            </div>
          ))}
        </div>
        {state.image_observations.map((e, i) => (
          <p className="tiny" key={i}>
            <b>Visible:</b> {e}
          </p>
        ))}
        {state.image_interpretations.map((e, i) => (
          <p className="tiny" key={i}>
            <b>Interpretation:</b> {e}
          </p>
        ))}
      </section>
      <section>
        <h3>Diagnostic timeline</h3>
        <ol className="timeline">
          {state.timeline.map((t, i) => (
            <li key={i}>
              <span>{i + 1}</span>
              <p dir="auto">{t}</p>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
export function SafetyChecklist({ steps }: { steps: string[] }) {
  return steps.length ? (
    <div className="safety-checklist">
      <ShieldCheck size={19} />
      <div>
        <strong>Safety before action</strong>
        <ul>
          {[...new Set(steps)].map((s, i) => (
            <li key={i} dir="auto">
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  ) : null;
}
const safetySteps = (text: string[]) =>
  text.filter((s) =>
    /disconnect|power off|power disconnected|wheels|hands clear|battery|capacitor|mains/i.test(
      s,
    ),
  );
export function TestCard({
  test,
  disabled,
  onResult,
}: {
  test: DiagnosticTest;
  disabled: boolean;
  onResult: (text: string) => void;
}) {
  return (
    <article className="test-card">
      <div className="test-top">
        <span>
          <FlaskConical size={15} /> RECOMMENDED TEST
        </span>
        <span>
          <Clock size={13} />
          {test.estimated_time}
        </span>
      </div>
      <h3 dir="auto">{test.name}</h3>
      <p dir="auto">{test.purpose}</p>
      <div className="test-tags">
        <span>
          <Wrench size={13} />
          {test.difficulty}
        </span>
        <span>
          {test.required_tools.length
            ? test.required_tools.join(', ')
            : 'No tools needed'}
        </span>
      </div>
      <ol>
        {test.instructions.map((step, i) => (
          <li key={i}>
            <span>{i + 1}</span>
            <p dir="auto">{step}</p>
          </li>
        ))}
      </ol>
      <SafetyChecklist
        steps={[test.safety, ...safetySteps(test.instructions)]}
      />
      <div className="test-response-label">What did you observe?</div>
      <div className="outcome-buttons">
        {test.outcomes.map((result) => (
          <button
            type="button"
            key={result}
            disabled={disabled}
            onClick={() => onResult(result)}
          >
            {result}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResult('Different result')}
        >
          Different result
        </button>
      </div>
    </article>
  );
}
export function FinalDiagnosis({
  state,
  onReport,
  onStartOwn,
  demo,
  resolved,
  onResolved,
}: {
  state: DiagnosticState;
  onReport: () => void;
  onStartOwn?: () => void;
  demo?: boolean;
  resolved?: boolean;
  onResolved?: () => void;
}) {
  const lead = state.hypotheses
    .slice()
    .sort((a, b) => b.probability - a.probability)[0];
  return (
    <article className="final-card">
      <div className="eyebrow">
        <Check size={16} />{' '}
        {resolved ? 'USER-REPORTED RESOLUTION' : 'PROVISIONAL DIAGNOSIS'}
      </div>
      <h2>{lead?.cause || 'Professional assessment needed'}</h2>
      <p>
        {resolved
          ? 'You marked the repair as verified.'
          : 'Verify the result before treating this as a confirmed repair.'}
      </p>
      <SafetyChecklist
        steps={safetySteps([...state.repair_plan, state.verification])}
      />
      <h3>
        <strong>Recommended action</strong>
      </h3>
      <ol className="result-steps">
        {state.repair_plan.map((p, i) => (
          <li key={i} dir="auto">
            {p}
          </li>
        ))}
      </ol>
      <h3>
        <strong>Verify the result</strong>
      </h3>
      <ol className="result-steps">
        <li dir="auto">
          {state.verification || 'Further evidence is required.'}
        </li>
      </ol>
      <div className="result-actions">
        <button className="primary" onClick={onReport}>
          Save report
        </button>
        {demo ? (
          <button className="secondary" onClick={onStartOwn}>
            Start your own diagnosis
          </button>
        ) : (
          <button className="secondary" onClick={onResolved}>
            {resolved
              ? 'Reopen diagnosis'
              : 'I verified the repair — mark resolved'}
          </button>
        )}
      </div>
    </article>
  );
}
