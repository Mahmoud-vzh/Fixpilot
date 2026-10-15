import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../src/App';
import { HypothesisPanel, SafetyChecklist, TestCard } from '../src/components/fixpilot/diagnostic-panels';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { startDemo } from '../src/lib/diagnostic/demo';
import { SafetyWarning } from '../src/components/fixpilot/safety-warning';
import { SAFETY_STOP_WARNING } from '../src/lib/diagnostic/safety';

test('Safety checklist hides absence markers but preserves actual precautions', () => {
  for (const steps of [
    [],
    [''],
    ['   '],
    ['None'],
    [' none. ', 'N/A', 'No safety warnings'],
    ['None, standard connection.'],
    [' NONE , standard connection '],
  ]) {
    assert.equal(renderToStaticMarkup(createElement(SafetyChecklist, { steps })), '');
  }
  const warning = 'Disconnect power before inspecting connections.';
  const html = renderToStaticMarkup(createElement(SafetyChecklist, {
    steps: ['None', '', ` ${warning} `, warning, 'None of the wires should be touched.'],
  }));
  assert.match(html, /Safety before action/);
  assert.equal(html.split(warning).length - 1, 1);
  assert.match(html, /None of the wires should be touched\./);
  assert.doesNotMatch(html, /<li[^>]*>None<\/li>/);
  const actionable = 'None, standard connection. Disconnect power before checking wires.';
  assert.match(
    renderToStaticMarkup(createElement(SafetyChecklist, { steps: [actionable] })),
    /Disconnect power before checking wires/,
  );
});

test('Test card omits empty safety callout and safety stops still show a warning', () => {
  const original = startDemo('robot').next_test!;
  const renderCard = (safety: string, instructions: string[]) => renderToStaticMarkup(
    createElement(TestCard, {
      test: { ...original, safety, instructions },
      disabled: false,
      onResult() {},
    }),
  );
  assert.doesNotMatch(renderCard('None', ['Observe the display.']), /Safety before action/);
  assert.doesNotMatch(renderCard('None, standard connection.', ['Observe the display.']), /Safety before action/);
  const html = renderCard('None', ['Disconnect power before inspecting connections.']);
  assert.match(html, /Safety before action/);
  assert.match(html, /Disconnect power before inspecting connections\./);
  const stopped = renderToStaticMarkup(createElement(SafetyWarning, { text: 'None', stopped: true }));
  assert.match(stopped, /role="alert"/);
  assert.ok(stopped.includes(SAFETY_STOP_WARNING));
});

test('Home renders guided demos and no owner-editing controls', () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /Motor not working/);
  assert.match(html, /Black screen/);
  assert.doesNotMatch(html, /Edit site|Owner:|Learn with a guided demo/);
});
test('Evidence panel does not display premature diagnosis confidence', () => {
  const html = renderToStaticMarkup(
    createElement(TooltipProvider, {
      children: createElement(HypothesisPanel, {
        state: startDemo('robot'),
        mode: 'demo',
      }),
    }),
  );
  assert.match(html, /Not reached yet/);
  assert.doesNotMatch(html, /Demo confidence/);
});
