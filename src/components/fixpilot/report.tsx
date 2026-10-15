'use client';
import { Download, Printer, FileText } from 'lucide-react';
import { normalizeSafetyWarning } from '@/lib/diagnostic/safety';
import { Session } from '@/lib/diagnostic/types';
function escape(v: string) {
  return v.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
function weight(n: number, mode: string) {
  return mode === 'demo' ? `${n}%` : `~${Math.round(n / 5) * 5}%`;
}
export function reportHTML(session: Session) {
  const s = session.state;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FixPilot Diagnostic Report</title><style>body{font:16px/1.65 Arial,sans-serif;color:#172218;max-width:850px;margin:40px auto;padding:32px}header{border-bottom:4px solid #3269cf;padding-bottom:24px}h1{font-size:34px;margin:0}h2{margin-top:30px;font-size:20px}small{color:#586457}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #ddd}li{margin:8px 0}.note{background:#eff5ff;padding:16px}@media print{body{margin:0;padding:15px}h2{break-after:avoid}tr,li{break-inside:avoid}}</style></head><body><header><small>FIXPILOT / DIAGNOSTIC REPORT</small><h1>${escape(s.device)}</h1><p>${escape(s.problem_summary)}</p><small>${escape(new Date(session.updated_at).toLocaleString())} · ${escape(session.mode === 'demo' ? 'Guided demo' : 'Model-assisted assessment')} · ${escape(s.status)}</small></header><h2>Assessment</h2><p>${escape(s.hypotheses.slice().sort((a, b) => b.probability - a.probability)[0]?.cause || 'Insufficient evidence')} · ${weight(s.diagnosis_confidence, session.mode)} estimated confidence</p><h2>Symptoms and evidence</h2><ul>${s.confirmed_symptoms.map((x) => `<li>${escape(x)}</li>`).join('')}</ul><h2>Tests performed</h2><table><tr><th>Test</th><th>Result</th></tr>${s.tests_completed.map((x) => `<tr><td>${escape(x.name)}</td><td>${escape(x.result)}</td></tr>`).join('')}</table><h2>Hypotheses considered</h2><table>${s.hypotheses.map((x) => `<tr><td>${escape(x.cause)}</td><td>${weight(x.probability, session.mode)}</td><td>${escape(x.change)}</td></tr>`).join('')}</table><h2>Recommended repair / next action</h2><ol>${(s.repair_plan.length ? s.repair_plan : [s.next_test?.name || 'Further assessment required']).map((x) => `<li>${escape(x)}</li>`).join('')}</ol><h2>Unresolved questions</h2><ul>${s.unknowns.map((x) => `<li>${escape(x)}</li>`).join('')}</ul><h2>Verification</h2><p>${escape(s.verification || 'Diagnosis is incomplete; further evidence is needed.')}</p><h2>Estimated cost</h2><p>${escape(s.cost)}</p><h2>Safety and limitations</h2><p class="note">${escape(normalizeSafetyWarning(s.safety_warning) || 'Keep power disconnected before inspecting connections. Consider battery hazards, data loss and warranty implications. Seek qualified repair assistance for any unsafe or uncertain procedure.')}<br>Live values are LLM estimates; demo values are authored. Neither is calibrated. Weights assume one main cause; multiple faults can coexist. FixPilot is not a substitute for a qualified professional in safety-critical situations. ${session.mode === 'demo' ? 'This report contains simulated evidence from a guided demonstration.' : ''}</p></body></html>`;
}
export function downloadReport(session: Session) {
  const url = URL.createObjectURL(
    new Blob([reportHTML(session)], { type: 'text/html' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `FixPilot-${session.id.slice(0, 8)}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ReportView({ session }: { session: Session }) {
  const s = session.state;
  return (
    <div className="report-view">
      <div className="report-toolbar">
        <button className="primary" onClick={() => downloadReport(session)}>
          <Download size={16} /> Download report
        </button>
        <button
          className="secondary"
          onClick={() => {
            const win = window.open('', '_blank');
            if (win) {
              win.opener = null;
              win.document.write(reportHTML(session));
              win.document.close();
              win.focus();
              win.print();
            }
          }}
        >
          <Printer size={16} /> Print / save PDF
        </button>
      </div>
      <div className="report-paper">
        <div className="eyebrow">
          <FileText size={16} /> FIXPILOT DIAGNOSTIC REPORT
        </div>
        <h1>{s.device}</h1>
        <p>{s.problem_summary}</p>
        <div className="report-meta">
          {new Date(session.updated_at).toLocaleDateString()} ·{' '}
          {session.mode === 'demo' ? 'Guided demo' : 'Model-assisted assessment'} ·{' '}
          {s.status.replace('_', ' ')}
        </div>
        <h2>Most likely cause</h2>
        <h3>
          {s.hypotheses.slice().sort((a, b) => b.probability - a.probability)[0]
            ?.cause || 'Insufficient evidence'}
        </h3>
        <p>
          {weight(s.diagnosis_confidence, session.mode)} estimated confidence.{' '}
          {s.status !== 'diagnosed'
            ? 'Diagnosis is incomplete.'
            : 'Provisional; verify before replacing parts.'}
        </p>
        <h2>Evidence</h2>
        <ul>
          {s.confirmed_symptoms.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
        <h2>Tests performed</h2>
        {s.tests_completed.length ? (
          s.tests_completed.map((t, i) => (
            <div className="report-test" key={i}>
              <b>{t.name}</b>
              <span>{t.result}</span>
            </div>
          ))
        ) : (
          <p>No tests completed.</p>
        )}
        <h2>Other causes considered</h2>
        {s.hypotheses.map((h) => (
          <div className="report-test" key={h.cause}>
            <b>{h.cause}</b>
            <span>
              {weight(h.probability, session.mode)} ·{' '}
              {h.change.replace('_', ' ')}
            </span>
          </div>
        ))}
        <h2>Recommended repair</h2>
        <ol>
          {(s.repair_plan.length
            ? s.repair_plan
            : [s.next_test?.name || 'Further evidence is required.']
          ).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
        <h2>Verification</h2>
        <p>
          {s.verification ||
            'Complete the diagnostic tests before selecting a repair.'}
        </p>
        <h2>Estimated cost</h2>
        <p>{s.cost}</p>
        <h2>Safety and limitations</h2>
        <p>
          {normalizeSafetyWarning(s.safety_warning) ||
            'Power off before physical inspections. Protect your data, check warranty conditions, and seek qualified assistance if the procedure is beyond your experience.'}
        </p>
        <p className="report-disclaimer">
          Weights assume one main cause; multiple faults may coexist. Live
          values are model estimates, and demo values are authored. FixPilot is
          a model-assisted diagnostic system, not a substitute for qualified
          repair professionals in safety-critical situations.{' '}
          {session.mode === 'demo' &&
            'This report uses simulated evidence from a guided demo.'}
        </p>
      </div>
    </div>
  );
}
